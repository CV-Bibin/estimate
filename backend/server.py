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
        'ROOM':   ['ROOM_AREA', 'SITOUT', 'VARANDAH', 'PORCH'],  # PORCH added
        'PLINTH': ['PLINTH_AREA'],
        'DOOR':   ['DOOR'],
        'WINDOW': ['WINDOW'],
        'TEXT':   ['TEXT', 'MTEXT', 'ROOM_AREA', 'SITOUT']
    }
}

# --- 2. JSON SERIALIZER ---
class CustomJSONProvider(DefaultJSONProvider):
    def default(self, obj):
        # ezdxf Vec2 serializes here for JSON
        try:
            if isinstance(obj, Vec2):
                return [round(obj.x, 3), round(obj.y, 3)]
        except Exception:
            pass
        return super().default(obj)

app.json_provider_class = CustomJSONProvider

# --- 3. GEOMETRY KERNEL ---


def get_vec2_list(entity, scale):
    points = []
    try:
        if entity.dxftype() == 'LWPOLYLINE':
            points = [Vec2(p) * scale for p in entity.get_points('xy')]
        elif entity.dxftype() == 'POLYLINE':
            points = [Vec2(v.dxf.location) * scale for v in entity.vertices()]
    except Exception:
        pass
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
            if not points:
                return segments
            for i in range(len(points) - 1):
                segments.append({'start': points[i], 'end': points[i + 1]})
            # close loop if closed or start==end
            if entity.is_closed or (len(points) > 2 and points[0].isclose(points[-1])):
                segments.append({'start': points[-1], 'end': points[0]})
    except Exception:
        pass
    return segments


def dist_point_to_segment(p, a, b):
    if a.isclose(b):
        return (p - a).magnitude
    ab = b - a
    l2 = ab.dot(ab)
    if l2 == 0:
        return (p - a).magnitude
    t = max(0, min(1, (p - a).dot(ab) / l2))
    proj = a + ab * t
    return (p - proj).magnitude


def is_point_in_poly(p, polygon):
    x, y = p.x, p.y
    n = len(polygon)
    if n == 0:
        return False
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
    if len(points) < 3:
        return 0, 0
    try:
        min_area = float('inf')
        best_dims = (0, 0)
        n = len(points)
        for i in range(n):
            p1 = points[i]
            p2 = points[(i + 1) % n]
            edge = p2 - p1
            if edge.magnitude == 0:
                continue
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


# --- 4. PIPELINE ---


def analyze_strict(doc, scale):
    msp = doc.modelspace()

    # --- Text extraction ---
    texts = []
    for e in msp.query('TEXT MTEXT'):
        try:
            txt = e.dxf.text if e.dxftype() == 'TEXT' else e.text
            txt = txt.strip().upper()
            if len(txt) > 1:
                texts.append({'val': txt, 'pos': Vec2(e.dxf.insert) * scale})
        except Exception:
            pass

    # --- Plinth (outer boundary) ---
    plinth_poly = []
    slab_area = 0.0
    for e in msp.query('LWPOLYLINE POLYLINE'):
        try:
            if e.dxf.layer.upper() in CONFIG['LAYERS']['PLINTH'] and e.is_closed:
                plinth_poly = get_vec2_list(e, scale)
                a = 0.0
                for i in range(len(plinth_poly)):
                    j = (i + 1) % len(plinth_poly)
                    a += plinth_poly[i].x * plinth_poly[j].y
                    a -= plinth_poly[j].x * plinth_poly[i].y
                slab_area = abs(a) / 2.0
                break
        except Exception:
            continue

    # --- Rooms (including SITOUT, PORCH) ---
    rooms = []
    # We'll also keep polygons tied to rooms for adjacency mapping
    for e in msp.query('LWPOLYLINE POLYLINE'):
        layer_name = e.dxf.layer.upper()
        try:
            if layer_name in CONFIG['LAYERS']['ROOM']:
                if not e.is_closed:
                    # treat visually-closed small gap as closed (skip complex heuristics for speed)
                    continue
                pts = get_vec2_list(e, scale)
                if len(pts) < 3:
                    continue
                # shoelace area
                a = 0.0
                for i in range(len(pts)):
                    j = (i + 1) % len(pts)
                    a += pts[i].x * pts[j].y
                    a -= pts[j].x * pts[i].y
                area = abs(a) / 2.0
                # filter tiny polygons (likely artifacts)
                if area < 0.5:
                    continue
                l, b = rotating_calipers_bbox(pts)

                # name mapping by text inside polygon
                name = "Unknown Room"
                for t in texts:
                    if is_point_in_poly(t['pos'], pts):
                        name = t['val']
                        break

                # default names for SITOUT / PORCH if text not present
                if name == "Unknown Room":
                    if "SITOUT" in layer_name:
                        name = "SITOUT"
                    elif "PORCH" in layer_name or "PORCH" in layer_name:
                        name = "PORCH"
                    elif "VARANDAH" in layer_name or "VERANDAH" in layer_name:
                        name = "VARANDAH"

                rooms.append({
                    'id': str(uuid.uuid4())[:8],
                    'name': name,
                    'area': round(area, 2),
                    'l': round(l, 2),
                    'b': round(b, 2),
                    'polygon': pts  # keep polygon for adjacency
                })
        except Exception:
            continue

    # --- Walls extraction & pairing (centerline approx) ---
    raw_segments = []
    for e in msp.query('LINE LWPOLYLINE POLYLINE'):
        try:
            if e.dxf.layer.upper() in CONFIG['LAYERS']['WALL']:
                raw_segments.extend(get_segments(e, scale))
        except Exception:
            continue

    walls = []
    enriched = []
    for s in raw_segments:
        try:
            vec = s['end'] - s['start']
            if vec.magnitude < CONFIG['MERGE_GAP']:
                continue
            u = vec.normalize() if vec.magnitude != 0 else Vec2(1, 0)
            enriched.append({
                's': s['start'],
                'e': s['end'],
                'u': u,
                'len': vec.magnitude,
                'mid': s['start'].lerp(s['end'], 0.5),
                'used': False
            })
        except Exception:
            continue

    # Pair parallels to find wall thickness (same as before)
    for i, w1 in enumerate(enriched):
        if w1['used']:
            continue
        best = None
        best_dist = float('inf')
        for j in range(i + 1, len(enriched)):
            w2 = enriched[j]
            if w2['used']:
                continue
            # ensure parallel-ish by dot product ~ 1 or -1
            try:
                if abs(w1['u'].dot(w2['u'])) < 0.98:
                    continue
            except Exception:
                continue
            # perpendicular distance between midpoints to line w1(s-e)
            dist = dist_point_to_segment(w2['mid'], w1['s'], w1['e'])
            if CONFIG['WALL_THICKNESS_MIN'] <= dist <= CONFIG['WALL_THICKNESS_MAX']:
                if dist < best_dist:
                    best_dist = dist
                    best = w2
        if best:
            w1['used'] = True
            best['used'] = True
            # create a centerline approx (average lengths)
            length = (w1['len'] + best['len']) / 2
            mid = w1['mid'].lerp(best['mid'], 0.5)
            u = w1['u']
            start = mid - (u * (length / 2))
            end = mid + (u * (length / 2))
            walls.append({
                'id': str(uuid.uuid4())[:8],
                'start': start,
                'end': end,
                'len': length,
                'thickness': best_dist,
                'mid': mid,
                'is_outer': False,
                'openings': [],
                'deductions': {'vol': 0.0, 'area': 0.0},
                'rooms': []
            })

    # If no walls found, try single-line fallback (treat line as centerline with default thickness)
    if not walls and enriched:
        for s in enriched:
            walls.append({
                'id': str(uuid.uuid4())[:8],
                'start': s['s'],
                'end': s['e'],
                'len': s['len'],
                'thickness': CONFIG['WALL_THICKNESS_MIN'],
                'mid': s['mid'],
                'is_outer': False,
                'openings': [],
                'deductions': {'vol': 0.0, 'area': 0.0},
                'rooms': []
            })

    # --- Map walls to plinth (outer) if plinth present ---
    if plinth_poly and walls:
        for w in walls:
            min_d = float('inf')
            for i in range(len(plinth_poly)):
                p1 = plinth_poly[i]
                p2 = plinth_poly[(i + 1) % len(plinth_poly)]
                try:
                    d = dist_point_to_segment(w['mid'], p1, p2)
                    if d < min_d:
                        min_d = d
                except Exception:
                    continue
            # if midpoint is close to plinth boundary (within 2x thickness) mark outer
            if min_d < (w['thickness'] * 2 + 1e-6):
                w['is_outer'] = True

    # --- Map walls to rooms (adjacency) using left/right sample points ---
    # Build list of room polygons for quick check
    room_polys = []
    for r in rooms:
        room_polys.append({'id': r['id'], 'name': r['name'], 'poly': r['polygon']})

    for w in walls:
        try:
            seg_vec = w['end'] - w['start']
            if seg_vec.magnitude == 0:
                continue
            dir_u = seg_vec.normalize()
            normal = Vec2(-dir_u.y, dir_u.x).normalize()
            # offset distance: half thickness + small buffer
            offset = max(0.2, (w['thickness'] / 2.0) + 0.05)
            test_left = w['mid'] + normal * offset
            test_right = w['mid'] - normal * offset

            # find which rooms contain left or right test points
            assigned = set()
            for rp in room_polys:
                poly = rp['poly']
                if is_point_in_poly(test_left, poly) or is_point_in_poly(test_right, poly):
                    assigned.add(rp['name'])
            w['rooms'] = list(assigned)
        except Exception:
            w['rooms'] = []

    # --- Openings detection & mapping (doors/windows) ---
    openings = []
    op_candidates = []
    for e in msp.query('LINE LWPOLYLINE POLYLINE'):
        try:
            layer = e.dxf.layer.upper()
            type_ = None
            if layer in CONFIG['LAYERS']['DOOR']:
                type_ = 'door'
            elif layer in CONFIG['LAYERS']['WINDOW']:
                type_ = 'window'
            if not type_:
                continue

            width = 0.0
            center = Vec2(0, 0)

            if e.dxftype() == 'LINE':
                s = Vec2(e.dxf.start) * scale
                e_pt = Vec2(e.dxf.end) * scale
                width = (s - e_pt).magnitude
                center = s.lerp(e_pt, 0.5)
                bbox_pts = [s, e_pt]
            else:
                pts = get_vec2_list(e, scale)
                if not pts:
                    continue
                xs = [p.x for p in pts]
                ys = [p.y for p in pts]
                width = max(max(xs) - min(xs), max(ys) - min(ys))
                center = Vec2(sum(xs) / len(xs), sum(ys) / len(ys))
                bbox_pts = pts

            op_candidates.append({'type': type_, 'width': width, 'center': center, 'bbox': bbox_pts})
        except Exception:
            continue

    # Assign openings to nearest wall (only one wall)
    for op in op_candidates:
        best_w = None
        min_d = float('inf')
        for w in walls:
            try:
                d = dist_point_to_segment(op['center'], w['start'], w['end'])
            except Exception:
                continue
            # Accept if within a reasonable perpendicular distance (1.5x thickness) and near segment
            if d < (w['thickness'] * 1.5 + 1e-6) and d < min_d:
                # also ensure projection onto segment (distance to mid not too large)
                dist_mid = (op['center'] - w['mid']).magnitude
                if dist_mid < (w['len'] / 2.0 + 0.5):
                    min_d = d
                    best_w = w
        if best_w:
            # duplicate check (same opening near same wall)
            is_dup = False
            for exist in best_w['openings']:
                try:
                    if (exist['center'] - op['center']).magnitude < 0.2:
                        is_dup = True
                        break
                except Exception:
                    pass
            if is_dup:
                continue

            # compute true width by projecting bbox onto wall direction
            try:
                wall_vec = (best_w['end'] - best_w['start'])
                wall_u = wall_vec.normalize() if wall_vec.magnitude != 0 else Vec2(1, 0)
                projections = [p.dot(wall_u) for p in op.get('bbox', [op['center']])]
                true_width = max(projections) - min(projections)
                if true_width <= 0:
                    true_width = op['width']
            except Exception:
                true_width = op['width']

            h = CONFIG['DOOR_HEIGHT'] if op['type'] == 'door' else CONFIG['WINDOW_HEIGHT']
            vol = true_width * h * best_w['thickness']
            area = true_width * h

            best_w['deductions']['vol'] += vol
            best_w['deductions']['area'] += area

            entry = {
                'id': str(uuid.uuid4())[:8],
                'type': op['type'],
                'width': round(true_width, 3),
                'height': h,
                'center': op['center'],
                'wall_id': best_w['id'],
            }
            best_w['openings'].append(entry)
            openings.append(entry)

    # --- Summary / BOQ-related measures (measurements first) ---
    masonry = 0.0
    plaster = 0.0
    summary = {'outer_walls_len': 0.0, 'inner_walls_len': 0.0, 'total_wall_len': 0.0}

    for w in walls:
        try:
            gross_vol = w['len'] * w['thickness'] * CONFIG['WALL_HEIGHT']
            net_vol = max(0.0, gross_vol - w['deductions']['vol'])
            # Count each wall once regardless of adjacency (outer or inner it's a physical wall)
            masonry += net_vol

            gross_area = w['len'] * CONFIG['WALL_HEIGHT'] * 2  # both faces
            net_area = max(0.0, gross_area - (w['deductions']['area'] * 2))
            plaster += net_area

            summary['total_wall_len'] += w['len']
            if w.get('is_outer'):
                summary['outer_walls_len'] += w['len']
            else:
                summary['inner_walls_len'] += w['len']
        except Exception:
            continue

    summary['outer_walls_len'] = round(summary['outer_walls_len'], 2)
    summary['inner_walls_len'] = round(summary['inner_walls_len'], 2)
    summary['total_wall_len'] = round(summary['total_wall_len'], 2)

    # Flatten rooms for frontend (convert polygon Vec2 lists to simple lists to make JSON friendly)
    formatted_rooms = []
    for r in rooms:
        try:
            poly_list = [[round(p.x, 3), round(p.y, 3)] for p in r.get('polygon', [])]
        except Exception:
            poly_list = []
        formatted_rooms.append({
            'id': r['id'],
            'name': r['name'],
            'l': r['l'],
            'b': r['b'],
            'area': r['area'],
            'polygon': poly_list
        })

    # Format walls for output (include adjacent rooms and openings summary)
    formatted_walls = []
    for w in walls:
        formatted_walls.append({
            'id': w['id'],
            'len': round(w['len'], 3),
            'thickness': round(w['thickness'], 3),
            'is_outer': bool(w.get('is_outer', False)),
            'rooms': w.get('rooms', []),
            'openings_count': len(w.get('openings', []))
        })

    # Format openings standalone
    formatted_openings = []
    for o in openings:
        try:
            center = [round(o['center'].x, 3), round(o['center'].y, 3)]
        except Exception:
            center = None
        formatted_openings.append({
            'id': o['id'],
            'type': o['type'],
            'width': round(o['width'], 3),
            'height': o['height'],
            'wall_id': o['wall_id'],
            'center': center,
            'volume': round(o['width'] * o['height'] * next((w['thickness'] for w in walls if w['id'] == o['wall_id']), CONFIG['WALL_THICKNESS_MIN']), 3)

        })

    # BOQ-like values but user wants measurements first — still useful to return
    boq = {
        'slab_area': round(slab_area, 2),
        'carpet_area': round(sum(r['area'] for r in rooms), 2),
        'masonry_vol': round(masonry, 3),
        'plaster_area': round(plaster, 2),
        'lintel_len': round(sum(o['width'] + 0.3 for o in formatted_openings), 2)
    }

    return {
        "status": "success",
        "timestamp": datetime.now().isoformat(),
        "summary": summary,
        "rooms": formatted_rooms,
        "walls": formatted_walls,
        "openings": formatted_openings,
        "boq": boq
    }


@app.route('/analyze-cad', methods=['POST'])
def analyze_cad():
    if 'file' not in request.files:
        return jsonify({"error": "No file"}), 400
    f = request.files['file']
    unit = request.form.get('unit', 'm')
    scale = {'mm': 0.001, 'cm': 0.01, 'm': 1.0, 'ft': 0.3048, 'in': 0.0254}.get(unit, 1.0)

    path = f"temp_{uuid.uuid4()}.dxf"
    f.save(path)
    try:
        doc = ezdxf.readfile(path)
        data = analyze_strict(doc, scale)
        return jsonify(data)
    except Exception as e:
        logger.error(f"Analysis Error: {e}", exc_info=True)
        return jsonify({"error": "Failed to parse DXF structure.", "detail": str(e)}), 500
    finally:
        if os.path.exists(path):
            try:
                os.remove(path)
            except Exception:
                pass


if __name__ == '__main__':
    app.run(debug=True, port=5000)
