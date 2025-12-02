from flask import Flask, request, jsonify
from flask.json.provider import DefaultJSONProvider
from flask_cors import CORS
import ezdxf
from ezdxf.math import Vec2
import os
import math
import logging
import uuid
import json
from datetime import datetime

app = Flask(__name__)
CORS(app)

# Configure Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- 1. CONFIGURATION (STRICT STANDARDS) ---
CONFIG = {
    'WALL_THICKNESS_MIN': 0.08, 
    'WALL_THICKNESS_MAX': 0.60,
    'PARALLEL_ANGLE_TOL': 0.05,
    'MERGE_GAP': 0.10,
    'SNAP_TOLERANCE': 0.20,
    
    'WALL_HEIGHT': 3.0,
    'LINTEL_BEARING': 0.15,
    'DOOR_HEIGHT': 2.1,
    'WINDOW_HEIGHT': 1.5,

    'LAYERS': {
        'WALL':   ['WALL'],           
        'ROOM':   ['ROOM_AREA'],      
        'PLINTH': ['PLINTH_AREA'],    
        'DOOR':   ['DOOR'],           
        'WINDOW': ['WINDOW'],
        'TEXT':   ['TEXT', 'MTEXT', 'ROOM_AREA']
    }
}

# --- 2. JSON SERIALIZER ---
class CustomJSONProvider(DefaultJSONProvider):
    def default(self, obj):
        if isinstance(obj, Vec2):
            return [round(obj.x, 3), round(obj.y, 3)]
        return super().default(obj)

app.json_provider_class = CustomJSONProvider

# --- 3. GEOMETRY KERNEL ---

def get_vec2_list(entity, scale):
    points = []
    try:
        if entity.dxftype() == 'LWPOLYLINE':
            points = [Vec2(p)*scale for p in entity.get_points('xy')]
        elif entity.dxftype() == 'POLYLINE':
            points = [Vec2(v.dxf.location)*scale for v in entity.vertices()]
    except: pass
    return points

def get_segments(entity, scale):
    segments = []
    try:
        if entity.dxftype() == 'LINE':
            s = Vec2(entity.dxf.start) * scale
            e = Vec2(entity.dxf.end) * scale
            segments.append({'start': s, 'end': e})
        elif entity.dxftype() in ('LWPOLYLINE', 'POLYLINE'):
            points = get_vec2_list(entity, scale)
            for i in range(len(points) - 1):
                segments.append({'start': points[i], 'end': points[i+1]})
            if entity.is_closed or (len(points) > 2 and points[0].isclose(points[-1])):
                segments.append({'start': points[-1], 'end': points[0]})
    except: pass
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
    """Calculates L x B. Includes Fallback to simple bbox."""
    if len(points) < 3: return 0, 0
    try:
        min_area = float('inf')
        best_dims = (0, 0)
        n = len(points)
        for i in range(n):
            p1 = points[i]
            p2 = points[(i+1)%n]
            edge = p2 - p1
            if edge.magnitude == 0: continue
            u = edge.normalize()
            v = Vec2(-u.y, u.x)
            min_u, max_u = float('inf'), float('-inf')
            min_v, max_v = float('inf'), float('-inf')
            for p in points:
                pu = p.dot(u); pv = p.dot(v)
                min_u = min(min_u, pu); max_u = max(max_u, pu)
                min_v = min(min_v, pv); max_v = max(max_v, pv)
            w = max_u - min_u
            h = max_v - min_v
            if (w * h) < min_area:
                min_area = w * h
                best_dims = (max(w, h), min(w, h))
        return best_dims
    except:
        # Fallback
        xs = [p.x for p in points]
        ys = [p.y for p in points]
        return (max(xs)-min(xs), max(ys)-min(ys))

# --- 4. PIPELINE ---

def analyze_strict(doc, scale):
    msp = doc.modelspace()
    
    print("\n--- 1. SCANNING TEXT ---")
    texts = []
    for e in msp.query('TEXT MTEXT'):
        try:
            txt = e.dxf.text if e.dxftype()=='TEXT' else e.text
            txt = txt.strip().upper()
            if len(txt) > 1:
                texts.append({'val': txt, 'pos': Vec2(e.dxf.insert)*scale})
                print(f"Found Text: {txt}")
        except: pass

    print("\n--- 2. SCANNING PLINTH ---")
    plinth_poly = []
    slab_area = 0.0
    for e in msp.query('LWPOLYLINE POLYLINE'):
        if e.dxf.layer.upper() in CONFIG['LAYERS']['PLINTH'] and e.is_closed:
            plinth_poly = get_vec2_list(e, scale)
            a = 0.0
            for i in range(len(plinth_poly)):
                j = (i + 1) % len(plinth_poly)
                a += plinth_poly[i].x * plinth_poly[j].y
                a -= plinth_poly[j].x * plinth_poly[i].y
            slab_area = abs(a) / 2.0
            print(f"Found Plinth: Area {slab_area:.2f} m2")
            break

    print("\n--- 3. SCANNING ROOMS ---")
    rooms = []
    for e in msp.query('LWPOLYLINE POLYLINE'):
        if e.dxf.layer.upper() in CONFIG['LAYERS']['ROOM']:
            if not e.is_closed: continue
            pts = get_vec2_list(e, scale)
            if len(pts) < 3: continue
            
            a = 0.0
            for i in range(len(pts)):
                j = (i + 1) % len(pts)
                a += pts[i].x * pts[j].y
                a -= pts[j].x * pts[i].y
            area = abs(a) / 2.0
            l, b = rotating_calipers_bbox(pts)
            
            name = "Unknown Room"
            for t in texts:
                if is_point_in_poly(t['pos'], pts):
                    name = t['val']; break
            
            print(f"Found Room: {name} ({l:.2f} x {b:.2f}) Area: {area:.2f}")
            rooms.append({'id': str(uuid.uuid4())[:8], 'name': name, 'area': round(area, 2), 'l': round(l, 2), 'b': round(b, 2)})

    print("\n--- 4. SCANNING WALLS ---")
    raw_segments = []
    for e in msp.query('LINE LWPOLYLINE POLYLINE'):
        if e.dxf.layer.upper() in CONFIG['LAYERS']['WALL']:
            raw_segments.extend(get_segments(e, scale))
    
    print(f"Found {len(raw_segments)} raw wall segments")
    
    walls = []
    enriched = []
    for s in raw_segments:
        vec = s['end'] - s['start']
        if vec.magnitude < CONFIG['MERGE_GAP']: continue
        enriched.append({
            's': s['start'], 'e': s['end'],
            'u': vec.normalize(), 'len': vec.magnitude,
            'mid': s['start'].lerp(s['end'], 0.5),
            'used': False
        })
        
    for i, w1 in enumerate(enriched):
        if w1['used']: continue
        best = None
        best_dist = float('inf')
        for j in range(i+1, len(enriched)):
            w2 = enriched[j]
            if w2['used']: continue
            if abs(w1['u'].dot(w2['u'])) < 0.98: continue 
            dist = dist_point_to_segment(w2['mid'], w1['s'], w1['e'])
            if CONFIG['WALL_THICKNESS_MIN'] <= dist <= CONFIG['WALL_THICKNESS_MAX']:
                if dist < best_dist:
                    best_dist = dist
                    best = w2
        if best:
            w1['used'] = True; best['used'] = True
            walls.append({
                'id': str(uuid.uuid4())[:8],
                'len': (w1['len'] + best['len']) / 2,
                'thickness': best_dist,
                'mid': w1['mid'].lerp(best['mid'], 0.5),
                'start': w1['s'], 'end': w1['e'],
                'is_outer': False, 'openings': [], 'deductions': {'vol': 0, 'area': 0}
            })
    print(f"Paired Walls: {len(walls)}")

    if plinth_poly:
        for w in walls:
            min_d = float('inf')
            for i in range(len(plinth_poly)):
                p1, p2 = plinth_poly[i], plinth_poly[(i+1)%len(plinth_poly)]
                d = dist_point_to_segment(w['mid'], p1, p2)
                if d < min_d: min_d = d
            if min_d < (w['thickness'] * 2): w['is_outer'] = True

    print("\n--- 5. SCANNING OPENINGS ---")
    openings = []
    op_candidates = []
    # FIX: Query ALL relevant types for openings
    for e in msp.query('LINE LWPOLYLINE POLYLINE'):
        layer = e.dxf.layer.upper()
        type_ = None
        if layer in CONFIG['LAYERS']['DOOR']: type_ = 'door'
        elif layer in CONFIG['LAYERS']['WINDOW']: type_ = 'window'
        if type_:
            width = 0.0
            center = Vec2(0,0)
            
            if e.dxftype() == 'LINE':
                s = Vec2(e.dxf.start)*scale; e_pt = Vec2(e.dxf.end)*scale
                width = (s - e_pt).magnitude; center = s.lerp(e_pt, 0.5)
            else:
                # Handle Rectangles/Polylines
                pts = get_vec2_list(e, scale)
                if not pts: continue
                xs = [p.x for p in pts]; ys = [p.y for p in pts]
                width = max(max(xs)-min(xs), max(ys)-min(ys)) # BBox max dim
                center = Vec2(sum(xs)/len(xs), sum(ys)/len(ys))
            
            op_candidates.append({'type': type_, 'width': width, 'center': center})
            print(f"Candidate {type_}: Width {width:.2f}")

    for op in op_candidates:
        best_w = None; min_d = float('inf')
        for w in walls:
            d = dist_point_to_segment(op['center'], w['start'], w['end'])
            if d < (w['thickness'] * 2) and d < min_d:
                min_d = d; best_w = w
        
        if best_w:
            is_dup = False
            for exist in best_w['openings']:
                if (exist['center'] - op['center']).magnitude < 0.2: is_dup = True
            if not is_dup:
                h = CONFIG['DOOR_HEIGHT'] if op['type'] == 'door' else CONFIG['WINDOW_HEIGHT']
                vol = op['width'] * h * best_w['thickness']
                area = op['width'] * h
                best_w['deductions']['vol'] += vol
                best_w['deductions']['area'] += area
                entry = {'type': op['type'], 'width': op['width'], 'center': op['center']}
                best_w['openings'].append(entry)
                openings.append(entry)
                print(f"Matched {op['type']} to Wall")

    # Summary
    masonry = 0.0; plaster = 0.0
    summary = {'outer_walls_len': 0.0, 'inner_walls_len': 0.0}
    for w in walls:
        gross_vol = w['len'] * w['thickness'] * CONFIG['WALL_HEIGHT']
        net_vol = max(0, gross_vol - w['deductions']['vol'])
        masonry += net_vol
        gross_area = w['len'] * CONFIG['WALL_HEIGHT'] * 2
        net_area = max(0, gross_area - (w['deductions']['area'] * 2))
        plaster += net_area
        if w['is_outer']: summary['outer_walls_len'] += w['len']
        else: summary['inner_walls_len'] += w['len']
            
    summary['outer_walls_len'] = round(summary['outer_walls_len'], 2)
    summary['inner_walls_len'] = round(summary['inner_walls_len'], 2)

    print("\n--- ANALYSIS COMPLETE ---")
    return {
        "status": "success",
        "timestamp": datetime.now().isoformat(),
        "summary": summary,
        "rooms": rooms,
        "walls": [{
            'id': w['id'], 
            'len': round(w['len'], 2), 
            'thickness': round(w['thickness'], 2),
            'is_outer': w['is_outer']
        } for w in walls],
        "openings": [{'type': o['type'], 'width': round(o['width'],2)} for o in openings],
        "boq": {
            'slab_area': round(slab_area, 2),
            'carpet_area': round(sum(r['area'] for r in rooms), 2),
            'masonry_vol': round(masonry, 2),
            'plaster_area': round(plaster, 2)
        }
    }

@app.route('/analyze-cad', methods=['POST'])
def analyze_cad():
    if 'file' not in request.files: return jsonify({"error": "No file"}), 400
    f = request.files['file']
    unit = request.form.get('unit', 'm')
    scale = {'mm':0.001, 'cm':0.01, 'm':1.0, 'ft':0.3048, 'in':0.0254}.get(unit, 1.0)
    
    path = f"temp_{uuid.uuid4()}.dxf"
    f.save(path)
    try:
        doc = ezdxf.readfile(path)
        data = analyze_strict(doc, scale)
        return jsonify(data)
    except Exception as e:
        logger.error(f"Analysis Error: {e}", exc_info=True)
        return jsonify({"error": "Failed to parse DXF structure."}), 500
    finally:
        if os.path.exists(path): os.remove(path)

if __name__ == '__main__':
    app.run(debug=True, port=5000)