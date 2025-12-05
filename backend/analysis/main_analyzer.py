# analysis/main_analyzer.py
from ezdxf.math import Vec2
from .plinth_extractor import extract_plinth
from .room_extractor import extract_rooms
from .wall_opening_extractor import extract_walls, extract_openings, map_walls_to_rooms

def analyze_strict(doc, scale):
    msp = doc.modelspace()

    # 1. Extract Texts
    texts = []
    for e in msp.query('TEXT MTEXT'):
        val = e.dxf.text if e.dxftype() == 'TEXT' else e.text
        pos = Vec2(e.dxf.insert) * scale
        val = (val or "").strip().upper()
        if val:
            texts.append({'val': val, 'pos': pos})

    # 2. Extract Geometry
    slab_area = extract_plinth(msp, scale)
    rooms = extract_rooms(msp, scale, texts) # <-- Now returns exact 'perimeter'
    walls = extract_walls(msp, scale)

    # 3. Attach walls ↔ rooms
    map_walls_to_rooms(walls, rooms)

    # 4. Extract openings
    openings = extract_openings(msp, scale, walls, rooms)

    # 5. Wall Length Split Logic
    ext_wall_len = 0.0
    int_wall_len = 0.0
    EXTERNAL_THRESHOLD = 0.20 

    for w in walls:
        thickness = w.get('thickness', 0.23) 
        length = w.get('len', 0)
        
        if thickness > EXTERNAL_THRESHOLD:
            ext_wall_len += length
        else:
            int_wall_len += length

    total_wall_len = ext_wall_len + int_wall_len

    # 6. Room Aggregation
    formatted_rooms = []
    total_room_perimeter = 0.0

    for r in rooms:
        # ✅ USE EXACT PERIMETER FROM POLYLINE
        perimeter = r['perimeter'] 
        total_room_perimeter += perimeter
        
        formatted_rooms.append({
            'name': r['name'],
            'area': r['area'],
            'perimeter': perimeter,
            'dims': f"{r['l']} x {r['b']}",
            'openings_attached': r['attached_openings']
        })

    counts = {
        'doors': len([o for o in openings if o['type'] == 'door']),
        'windows': len([o for o in openings if o['type'] == 'window']),
        'ventilators': len([o for o in openings if o['type'] == 'ventilator'])
    }

    return {
        "status": "success",
        "boq": {
            "slab_area": round(slab_area, 2),
            "carpet_area": round(sum(r['area'] for r in rooms), 2),
            "total_wall_length": round(total_wall_len, 2),
            "external_wall_length": round(ext_wall_len, 2),
            "internal_wall_length": round(int_wall_len, 2),
            "room_perimeter": round(total_room_perimeter, 2) # <-- Exact Sum
        },
        "counts": counts,
        "rooms": formatted_rooms,
        "walls_raw": len(walls)
    }