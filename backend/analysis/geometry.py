# analysis/geometry.py
from ezdxf.math import Vec2

def get_vec2_list(entity, scale):
    pts = []
    try:
        if entity.dxftype() == 'LWPOLYLINE':
            pts = [Vec2(p) * scale for p in entity.get_points('xy')]
        elif entity.dxftype() == 'POLYLINE':
            pts = [Vec2(v.dxf.location) * scale for v in entity.vertices()]
    except:
        pass
    return pts

def get_segments(entity, scale):
    segs = []
    try:
        if entity.dxftype() == 'LINE':
            s = Vec2(entity.dxf.start) * scale
            e = Vec2(entity.dxf.end) * scale
            segs.append({'start': s, 'end': e})

        elif entity.dxftype() in ('LWPOLYLINE', 'POLYLINE'):
            pts = get_vec2_list(entity, scale)
            for i in range(len(pts) - 1):
                segs.append({'start': pts[i], 'end': pts[i + 1]})
            if len(pts) > 2 and pts[0].isclose(pts[-1]):
                segs.append({'start': pts[-1], 'end': pts[0]})
    except:
        pass

    return segs


def dist_point_to_segment(p, a, b):
    if a.isclose(b):
        return (p - a).magnitude
    ab = b - a
    t = max(0, min(1, (p - a).dot(ab) / ab.dot(ab)))
    proj = a + ab * t
    return (p - proj).magnitude


def is_point_in_poly(p, poly):
    x, y = p.x, p.y
    n = len(poly)
    if n == 0:
        return False

    inside = False
    p1x, p1y = poly[0].x, poly[0].y

    for i in range(n + 1):
        p2x, p2y = poly[i % n].x, poly[i % n].y
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
        return (0, 0)

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

            if w * h < min_area:
                min_area = w * h
                best_dims = (max(w, h), min(w, h))

        return best_dims

    except:
        return (0, 0)
