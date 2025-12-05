# analysis/plinth_extractor.py
from .geometry import get_vec2_list
from .config import CONFIG

def extract_plinth(msp, scale):
    for e in msp.query('LWPOLYLINE POLYLINE'):
        if e.dxf.layer.upper() in CONFIG['LAYERS']['PLINTH'] and getattr(e, 'is_closed', False):
            pts = get_vec2_list(e, scale)
            a = 0
            for i in range(len(pts)):
                j = (i + 1) % len(pts)
                a += pts[i].x * pts[j].y
                a -= pts[j].x * pts[i].y
            return abs(a) / 2
    return 0
