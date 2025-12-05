# analysis/room_extractor.py
from .geometry import get_vec2_list, is_point_in_poly, rotating_calipers_bbox
from .config import CONFIG
import uuid

def extract_rooms(msp, scale, texts):
    rooms = []

    for e in msp.query('LWPOLYLINE POLYLINE'):
        if e.dxf.layer.upper() not in CONFIG['LAYERS']['ROOM']:
            continue
        if not getattr(e, 'is_closed', False):
            continue

        pts = get_vec2_list(e, scale)
        if len(pts) < 3: 
            continue

        # 1. Compute Area (Shoelace Formula)
        a = 0
        for i in range(len(pts)):
            j = (i + 1) % len(pts)
            a += pts[i].x * pts[j].y
            a -= pts[j].x * pts[i].y

        area = abs(a) / 2
        if area < 0.5:
            continue

        # 2. ✅ NEW: Compute Exact Perimeter (Sum of segment lengths)
        perimeter = 0.0
        for i in range(len(pts)):
            p1 = pts[i]
            p2 = pts[(i + 1) % len(pts)] # Connect last point to first
            perimeter += (p1 - p2).magnitude

        # 3. Bounding Box (still useful for approximate L x B display)
        l, b = rotating_calipers_bbox(pts)

        # 4. Find Room Name
        name = "UNKNOWN"
        for t in texts:
            if is_point_in_poly(t['pos'], pts):
                name = t['val']
                break

        rooms.append({
            'id': str(uuid.uuid4())[:8],
            'name': name,
            'area': round(area, 2),
            'perimeter': round(perimeter, 2), # <-- Storing exact polyline length
            'l': round(l, 2),
            'b': round(b, 2),
            'polygon': pts,
            'attached_openings': []
        })

    return rooms