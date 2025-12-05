# analysis/wall_opening_extractor.py
from .geometry import get_segments, dist_point_to_segment, is_point_in_poly
from .config import CONFIG
from ezdxf.math import Vec2
import uuid

def extract_walls(msp, scale):
    raw_segments = []

    # 1. Collect all potential wall lines
    for e in msp.query('LINE LWPOLYLINE POLYLINE'):
        if e.dxf.layer.upper() in CONFIG['LAYERS']['WALL']:
            raw_segments.extend(get_segments(e, scale))

    enriched = []
    for s in raw_segments:
        vec = s['end'] - s['start']
        # Filter out tiny noise lines
        if vec.magnitude < CONFIG['MERGE_GAP']:
            continue
        enriched.append({
            's': s['start'],
            'e': s['end'],
            'u': vec.normalize(),
            'len': vec.magnitude,
            'mid': s['start'].lerp(s['end'], 0.5),
            'used': False
        })

    walls = []
    
    # 2. Pair parallel lines to find Wall Centerlines & Thickness
    for i, w1 in enumerate(enriched):
        if w1['used']:
            continue

        best = None
        best_dist = float('inf')

        for j in range(i + 1, len(enriched)):
            w2 = enriched[j]
            if w2['used']:
                continue

            # Must be parallel (dot product approx 1 or -1)
            if abs(w1['u'].dot(w2['u'])) < 0.98:
                continue

            # Check distance between lines (thickness)
            dist = dist_point_to_segment(w2['mid'], w1['s'], w1['e'])
            
            # Valid Wall Thickness Check (e.g., 0.1m to 0.4m)
            if CONFIG['WALL_THICKNESS_MIN'] <= dist <= CONFIG['WALL_THICKNESS_MAX']:
                if dist < best_dist:
                    best_dist = dist
                    best = w2

        # If a pair is found, create a Wall Object
        if best:
            w1['used'] = True
            best['used'] = True
            walls.append({
                'id': str(uuid.uuid4())[:8],
                'start': w1['mid'], # Ideally, avg of w1['mid'] and best['mid'] projected
                'end': best['mid'],
                'len': (w1['len'] + best['len']) / 2,
                'thickness': best_dist,  # <--- CRITICAL: This is what we use for Ext vs Int logic
                'mid': w1['mid'].lerp(best['mid'], 0.5),
                'rooms': [],
                'openings': []
            })
        else:
            # ✅ FALLBACK: Single Line Walls (e.g., partitioned using single lines in CAD)
            # If no parallel pair is found, assume it's a thin internal partition
            # Only do this if you want to count single lines as walls
            # w1['used'] = True
            # walls.append({
            #    'id': str(uuid.uuid4())[:8],
            #    'start': w1['s'],
            #    'end': w1['e'],
            #    'len': w1['len'],
            #    'thickness': 0.1, # Default to 100mm
            #    'mid': w1['mid'],
            #    'rooms': [],
            #    'openings': []
            # })
            pass

    return walls


def map_walls_to_rooms(walls, rooms):
    room_data = [{'id': r['id'], 'name': r['name'], 'poly': r['polygon']} for r in rooms]

    for w in walls:
        normal = (w['end'] - w['start'])
        normal = Vec2(-normal.y, normal.x).normalize()

        # Check points slightly to the left and right of the wall center
        check_pts = [
            w['mid'] + normal * 0.15, # Use a smaller offset (15cm) to stay inside room
            w['mid'] - normal * 0.15
        ]

        found = []

        for rp in room_data:
            for cp in check_pts:
                if is_point_in_poly(cp, rp['poly']):
                    found.append({'id': rp['id'], 'name': rp['name']})

        # Remove duplicates
        w['rooms'] = list({f['id']: f for f in found}.values())
    
    return walls


def extract_openings(msp, scale, walls, rooms):
    openings = []

    for e in msp.query('LINE LWPOLYLINE POLYLINE ARC CIRCLE'):
        layer = e.dxf.layer.upper()
        o_type = None
        
        # Check Layers from CONFIG
        if any(L in layer for L in CONFIG['LAYERS']['DOOR']):
            o_type = 'door'
        elif any(L in layer for L in CONFIG['LAYERS']['WINDOW']):
            o_type = 'window'

        if not o_type:
            continue

        # 1. Geometry Extraction
        center = None
        width = 0

        if e.dxftype() == 'LINE':
            s = Vec2(e.dxf.start) * scale
            en = Vec2(e.dxf.end) * scale
            center = s.lerp(en, 0.5)
            width = (s - en).magnitude

        elif e.dxftype() in ['LWPOLYLINE', 'POLYLINE']:
            # Use bounding box for polyline blocks
            # Simple approximation: start to end distance
            try:
                points = e.get_points('xy')
                if not points: continue
                s = Vec2(points[0]) * scale
                en = Vec2(points[-1]) * scale
                center = s.lerp(en, 0.5)
                width = (s - en).magnitude
            except: continue

        elif e.dxftype() == 'CIRCLE':
            center = Vec2(e.dxf.center) * scale
            width = e.dxf.radius * 2 * scale
            
        elif e.dxftype() == 'ARC':
             # For door swings (arcs), finding width is tricky. 
             # Usually radius = width of door
             center = Vec2(e.dxf.center) * scale # This is usually the hinge point
             width = e.dxf.radius * scale
        
        if not center: continue
        
        # 2. Match Opening to Closest Wall
        best_w = None
        min_d = float('inf')

        for w in walls:
            # Distance from Opening Center to Wall Segment
            d = dist_point_to_segment(center, w['start'], w['end'])
            
            # Tolerance: Distance must be close to wall thickness
            if d < 0.5 and d < min_d: # 0.5m search radius
                min_d = d
                best_w = w

        if not best_w:
            continue

        # 3. Auto-classify Ventilators based on Room Name
        if o_type == 'window':
            for r in best_w['rooms']:
                rn = r['name'].upper()
                if any(k in rn for k in ['TOILET', 'BATH', 'WC', 'W.C', 'WASH', 'LAT']):
                    o_type = 'ventilator'
                    break

        op = {
            'id': str(uuid.uuid4())[:8],
            'type': o_type,
            'width': round(width, 2),
            'wall_id': best_w['id']
        }

        openings.append(op)
        best_w['openings'].append(op)

        # 4. Attach to Room Object for JSON output
        for r in best_w['rooms']:
            r_obj = next((x for x in rooms if x['id'] == r['id']), None)
            if r_obj:
                r_obj['attached_openings'].append(f"{o_type} ({round(width, 2)}m)")

    return openings