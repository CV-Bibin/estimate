from flask import Flask, request, jsonify
from flask.json.provider import DefaultJSONProvider
from flask_cors import CORS
import ezdxf
from ezdxf.math import Vec2
import os
import math
import logging
import uuid
from datetime import datetime
import ai_engine

app = Flask(__name__)
CORS(app)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("DXF_ENGINE")

# --- CONFIGURATION ---
CONFIG = {
    'WALL_THICKNESS_MIN': 0.08,
    'WALL_THICKNESS_MAX': 0.60,
    'MERGE_GAP': 0.10,
    'SNAP_TOLERANCE': 0.20,
    'WALL_HEIGHT': 3.0,
    'LINTEL_BEARING': 0.15,
    'DOOR_HEIGHT': 2.1,
    'WINDOW_HEIGHT': 1.5,
    'LAYERS': {
        'WALL':   ['WALL'],
        'ROOM':   ['ROOM_AREA', 'SITOUT', 'VARANDAH', 'PORCH'],
        'PLINTH': ['PLINTH_AREA'],
        'DOOR':   ['DOOR'],
        'WINDOW': ['WINDOW'],
        # Ventilator layer removed; handled by logic
        'TEXT':   ['TEXT', 'MTEXT', 'ROOM_AREA', 'SITOUT']
    }
}

class CustomJSONProvider(DefaultJSONProvider):
    def default(self, obj):
        try:
            if isinstance(obj, Vec2):
                return [round(obj.x, 3), round(obj.y, 3)]
        except Exception:
            pass
        return super().default(obj)

app.json_provider_class = CustomJSONProvider

# --- GEOMETRY HELPERS ---
def get_vec2_list(entity, scale):
    pts = []
    try:
        if entity.dxftype() == 'LWPOLYLINE':
            pts = [Vec2(p) * scale for p in entity.get_points('xy')]
        elif entity.dxftype() == 'POLYLINE':
            pts = [Vec2(v.dxf.location) * scale for v in entity.vertices()]
    except Exception:
        pass
    return pts

def get_segments(entity, scale):
    segments = []
    try:
        dtype = entity.dxftype()
        if dtype == 'LINE':
            s = Vec2(entity.dxf.start) * scale
            e = Vec2(entity.dxf.end) * scale
            segments.append({'start': s, 'end': e})
        elif dtype in ('LWPOLYLINE', 'POLYLINE'):
            pts = get_vec2_list(entity, scale)
            if not pts: return segments
            for i in range(len(pts) - 1):
                segments.append({'start': pts[i], 'end': pts[i + 1]})
            if getattr(entity, 'is_closed', False) or (len(pts) > 2 and pts[0].isclose(pts[-1])):
                segments.append({'start': pts[-1], 'end': pts[0]})
    except Exception:
        pass
    return segments

def dist_point_to_segment(p, a, b):
    if a.isclose(b): return (p - a).magnitude
    ab = b - a
    l2 = ab.dot(ab)
    if l2 == 0: return (p - a).magnitude
    t = max(0, min(1, (p - a).dot(ab) / l2))
    proj = a + ab * t
    return (p - proj).magnitude

def is_point_in_poly(p, polygon):
    x, y = p.x, p.y
    n = len(polygon)
    if n == 0: return False
    inside = False
    p1x, p1y = polygon[0].x, polygon[0].y
    for i in range(n + 1):
        p2x, p2y = polygon[i % n].x, polygon[i % n].y
        if min(p1y, p2y) < y <= max(p1y, p2y):
            if x <= max(p1x, p2x):
                if p1y != p2y:
                    xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                if p1x == p2x or x <= xinters:
                    inside = not inside
        p1x, p1y = p2x, p2y
    return inside

def rotating_calipers_bbox(points):
    if len(points) < 3: return 0, 0
    try:
        min_area = float('inf')
        best_dims = (0, 0)
        n = len(points)
        for i in range(n):
            p1 = points[i]
            p2 = points[(i + 1) % n]
            edge = p2 - p1
            if edge.magnitude == 0: continue
            u = edge.normalize()
            v = Vec2(-u.y, u.x)
            min_u, max_u = float('inf'), float('-inf')
            min_v, max_v = float('inf'), float('-inf')
            for p in points:
                pu = p.dot(u)
                pv = p.dot(v)
                min_u = min(min_u, pu)
                max_u = max(max_u, pu)
                min_v = min(min_v, pv)
                max_v = max(max_v, pv)
            w = max_u - min_u
            h = max_v - min_v
            if (w * h) < min_area:
                min_area = w * h
                best_dims = (max(w, h), min(w, h))
        return best_dims
    except Exception:
        return 0, 0

# --- MAIN ANALYSIS LOGIC ---
def analyze_strict(doc, scale):
    msp = doc.modelspace()
    texts = []
    # 1. Text Extraction
    for e in msp.query('TEXT MTEXT'):
        try:
            val = e.dxf.text if e.dxftype() == 'TEXT' else e.text
            pos = Vec2(e.dxf.insert) * scale
            val = (val or "").strip().upper()
            if val: texts.append({'val': val, 'pos': pos})
        except: continue

    # 2. Plinth Extraction
    plinth_poly = []
    slab_area = 0.0
    for e in msp.query('LWPOLYLINE POLYLINE'):
        if e.dxf.layer.upper() in CONFIG['LAYERS']['PLINTH'] and getattr(e, 'is_closed', False):
            plinth_poly = get_vec2_list(e, scale)
            a = 0.0
            for i in range(len(plinth_poly)):
                j = (i + 1) % len(plinth_poly)
                a += plinth_poly[i].x * plinth_poly[j].y
                a -= plinth_poly[j].x * plinth_poly[i].y
            slab_area = abs(a) / 2.0
            break

    # 3. Rooms Extraction
    rooms = []
    for e in msp.query('LWPOLYLINE POLYLINE'):
        if e.dxf.layer.upper() in CONFIG['LAYERS']['ROOM']:
            if not getattr(e, 'is_closed', False): continue
            pts = get_vec2_list(e, scale)
            if len(pts) < 3: continue
            a = 0.0
            for i in range(len(pts)):
                j = (i + 1) % len(pts)
                a += pts[i].x * pts[j].y
                a -= pts[j].x * pts[i].y
            area = abs(a) / 2.0
            if area < 0.5: continue
            l, b = rotating_calipers_bbox(pts)
            
            name = "UNKNOWN"
            for t in texts:
                if is_point_in_poly(t['pos'], pts):
                    name = t['val']
                    break
            
            if name == "UNKNOWN":
                ln = e.dxf.layer.upper()
                if "SITOUT" in ln: name = "SITOUT"
                elif "PORCH" in ln: name = "PORCH"
            
            rooms.append({
                'id': str(uuid.uuid4())[:8],
                'name': name,
                'area': round(area, 2),
                'l': round(l, 2),
                'b': round(b, 2),
                'polygon': pts,
                'attached_openings': []  # Vital for Frontend
            })

    # 4. Wall Extraction
    walls = []
    raw_segments = []
    for e in msp.query('LINE LWPOLYLINE POLYLINE'):
        if e.dxf.layer.upper() in CONFIG['LAYERS']['WALL']:
            raw_segments.extend(get_segments(e, scale))
            
    enriched = []
    for s in raw_segments:
        vec = s['end'] - s['start']
        if vec.magnitude < CONFIG['MERGE_GAP']: continue
        enriched.append({
            's': s['start'], 'e': s['end'], 'u': vec.normalize(),
            'len': vec.magnitude, 'mid': s['start'].lerp(s['end'], 0.5), 'used': False
        })

    for i, w1 in enumerate(enriched):
        if w1['used']: continue
        best, best_dist = None, float('inf')
        for j in range(i+1, len(enriched)):
            w2 = enriched[j]
            if w2['used']: continue
            if abs(w1['u'].dot(w2['u'])) < 0.98: continue
            dist = dist_point_to_segment(w2['mid'], w1['s'], w1['e'])
            if CONFIG['WALL_THICKNESS_MIN'] <= dist <= CONFIG['WALL_THICKNESS_MAX']:
                if dist < best_dist: best_dist, best = dist, w2
        
        if best:
            w1['used'] = True; best['used'] = True
            walls.append({
                'id': str(uuid.uuid4())[:8],
                'start': w1['mid'], 'end': best['mid'], 
                'len': (w1['len'] + best['len'])/2,
                'thickness': best_dist,
                'mid': w1['mid'].lerp(best['mid'], 0.5),
                'rooms': [], 'openings': [] 
            })
    
    # 5. Map Walls to Rooms
    room_data = [{'id':r['id'], 'name':r['name'], 'poly':r['polygon']} for r in rooms]
    for w in walls:
        normal = Vec2(-w['start'].y + w['end'].y, w['start'].x - w['end'].x).normalize()
        check_pts = [w['mid'] + normal * 0.2, w['mid'] - normal * 0.2]
        found_rooms = []
        for rp in room_data:
            for cp in check_pts:
                if is_point_in_poly(cp, rp['poly']):
                    found_rooms.append({'id': rp['id'], 'name': rp['name']})
        w['rooms'] = list({v['id']:v for v in found_rooms}.values())

    # 6. Extract Openings & Classify
    openings = []
    for e in msp.query('LINE LWPOLYLINE POLYLINE ARC CIRCLE'):
        layer = e.dxf.layer.upper()
        o_type = None
        if layer in CONFIG['LAYERS']['DOOR']: o_type = 'door'
        elif layer in CONFIG['LAYERS']['WINDOW']: o_type = 'window'
        
        if not o_type: continue
        
        center = Vec2(0,0)
        width = 0.8 
        if e.dxftype() == 'LINE':
            s, en = Vec2(e.dxf.start)*scale, Vec2(e.dxf.end)*scale
            width = (s-en).magnitude
            center = s.lerp(en, 0.5)
        elif e.dxftype() == 'CIRCLE':
            center = Vec2(e.dxf.center)*scale
            width = e.dxf.radius * 2 * scale
        
        best_w = None
        min_d = float('inf')
        for w in walls:
            d = dist_point_to_segment(center, w['start'], w['end'])
            if d < (w['thickness']*2) and d < min_d:
                min_d = d
                best_w = w
        
        if best_w:
            # Auto-classify Toilet Windows as Ventilators
            if o_type == 'window':
                for r_ref in best_w['rooms']:
                    r_name = r_ref['name'].upper()
                    if any(k in r_name for k in ['TOILET', 'BATH', 'WC', 'W.C', 'WASH', 'LAT']):
                        o_type = 'ventilator'
                        break

            op_obj = {
                'id': str(uuid.uuid4())[:8],
                'type': o_type,
                'width': round(width, 2),
                'wall_id': best_w['id']
            }
            openings.append(op_obj)
            best_w['openings'].append(op_obj)
            
            # Map opening to room for display
            for r_ref in best_w['rooms']:
                room_obj = next((r for r in rooms if r['id'] == r_ref['id']), None)
                if room_obj:
                    room_obj['attached_openings'].append(f"{o_type} ({round(width,2)}m)")

    # 7. Format Output for Frontend
    formatted_rooms = []
    for r in rooms:
        formatted_rooms.append({
            'name': r['name'],
            'area': round(r['area'], 2),
            'dims': f"{round(r['l'], 2)} x {round(r['b'], 2)}",
            'openings_attached': r['attached_openings'] # Frontend needs this
        })

    # Critical: Counts object required by Frontend
    counts = {
        'doors': len([o for o in openings if o['type'] == 'door']),
        'windows': len([o for o in openings if o['type'] == 'window']),
        'ventilators': len([o for o in openings if o['type'] == 'ventilator']),
    }

    return {
        "status": "success",
        "boq": {
            "slab_area": round(slab_area, 2),
            "carpet_area": round(sum(r['area'] for r in rooms), 2),
        },
        "counts": counts, # Frontend needs this
        "rooms": formatted_rooms,
        "walls_raw": len(walls)
    }

@app.route('/analyze-cad', methods=['POST'])
def analyze_cad():
    if 'file' not in request.files: return jsonify({"error": "No file"}), 400
    f = request.files['file']
    img = request.files.get('image_file')
    unit = request.form.get('unit', 'm')
    scale = {'mm': 0.001, 'cm': 0.01, 'm': 1.0, 'ft': 0.3048}.get(unit.lower(), 1.0)
    
    sess_id = str(uuid.uuid4())
    d_path = f"uploads/{sess_id}.dxf"
    i_path = f"uploads/{sess_id}.jpg" if img else None
    os.makedirs("uploads", exist_ok=True)
    f.save(d_path)
    if img: img.save(i_path)
    
    try:
        doc = ezdxf.readfile(d_path)
        
        # 1. Run strict geometric analysis
        cad_data = analyze_strict(doc, scale)
        
        # 2. Run AI Analysis
        ai_res = ai_engine.generate_architectural_insight(cad_data, i_path)
        cad_data['ai_analysis'] = ai_res
        
        return jsonify(cad_data)
    except Exception as e:
        logger.error(e)
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(d_path): os.remove(d_path)
        if i_path and os.path.exists(i_path): os.remove(i_path)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)