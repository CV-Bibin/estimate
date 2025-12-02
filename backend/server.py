from flask import Flask, request, jsonify
from flask_cors import CORS
import ezdxf
import os
import math

app = Flask(__name__)
CORS(app)

# --- CONFIGURATION ---
HEIGHTS = {"DOOR": 2.1, "WINDOW": 1.5, "WALL": 3.0}
TOLERANCE_THICKNESS = 0.03  # +/- 3cm
TOLERANCE_BOUNDARY = 0.25   # 25cm
ANGLE_TOLERANCE = math.radians(5)  # +/- 5° for wall pairing

# --- GEOMETRY HELPERS ---
def get_segments(entity):
    segments = []
    if entity.dxftype() in ('LINE',):
        segments.append({'start': entity.dxf.start, 'end': entity.dxf.end})
    elif entity.dxftype() in ('LWPOLYLINE', 'POLYLINE'):
        try:
            with entity.points("xy") as pts:
                points = list(pts)
        except Exception:
            return []
        for i in range(len(points)-1):
            segments.append({'start': points[i], 'end': points[i+1]})
        if getattr(entity,"is_closed",False) and len(points)>0:
            segments.append({'start': points[-1], 'end': points[0]})
    return segments

def distance_point_line(px, py, x1, y1, x2, y2):
    norm = math.hypot(x2-x1, y2-y1)
    if norm == 0: return math.hypot(px-x1, py-y1)
    return abs((x2-x1)*(y1-py) - (x1-px)*(y2-y1)) / norm

def dist_point_to_segment_min(px, py, x1, y1, x2, y2):
    l2 = (x1-x2)**2 + (y1-y2)**2
    if l2 == 0: return math.hypot(px-x1, py-y1)
    t = max(0, min(1, ((px-x1)*(x2-x1) + (py-y1)*(y2-y1))/l2))
    return math.hypot(px - (x1 + t*(x2-x1)), py - (y1 + t*(y2-y1)))

def is_touching_boundary(mid, boundary_points):
    if not boundary_points: return False
    mx, my = mid
    return any(dist_point_to_segment_min(mx, my, p1[0], p1[1], p2[0], p2[1]) <= TOLERANCE_BOUNDARY
               for i, p1 in enumerate(boundary_points)
               for p2 in [boundary_points[(i+1)%len(boundary_points)]])

def is_point_in_poly(x, y, poly_points):
    n = len(poly_points)
    inside = False
    p1x, p1y = poly_points[0]
    for i in range(n+1):
        p2x, p2y = poly_points[i%n]
        if y>min(p1y,p2y) and y<=max(p1y,p2y) and x<=max(p1x,p2x):
            if p1y!=p2y:
                xinters = (y-p1y)*(p2x-p1x)/(p2y-p1y)+p1x
            if p1x==p2x or x<=xinters: inside = not inside
        p1x, p1y = p2x, p2y
    return inside

def calculate_polygon_area(points):
    if len(points)<3: return 0.0
    return abs(sum(points[i][0]*points[(i+1)%len(points)][1] - points[(i+1)%len(points)][0]*points[i][1] 
                   for i in range(len(points))))/2

# --- AUTO SCALE DETECTION ---
def detect_scale_factor(msp):
    total_len = count = 0
    for entity in msp.query('LINE LWPOLYLINE POLYLINE'):
        if "WALL" in entity.dxf.layer.upper():
            for s in get_segments(entity):
                total_len += math.dist(s['start'], s['end'])
                count += 1
    if count==0: return 1.0
    avg = total_len/count
    if avg>500: return 0.001
    if avg>20: return 0.01
    return 1.0

# --- MAIN LOGIC ---
def analyze_cad_logic(msp):
    results = {
        "walls_outer_23_len":0, "walls_inner_23_len":0, "walls_inner_15_len":0,
        "slab_area":0, "rooms":[], "openings":[], "debug_log":[]
    }

    SCALE = detect_scale_factor(msp)
    results['debug_log'].append(f"SCALE={SCALE}")

    # --- Outer Boundary ---
    boundary_points=[]
    for entity in msp.query('LWPOLYLINE POLYLINE'):
        if "PLINTH" in entity.dxf.layer.upper() or "OUTER" in entity.dxf.layer.upper():
            if getattr(entity,"is_closed",False):
                with entity.points("xy") as pts:
                    boundary_points=[(p[0]*SCALE, p[1]*SCALE) for p in pts]
                results['slab_area']=calculate_polygon_area(boundary_points)
                break

    # --- Collect TEXT ---
    texts=[]
    for entity in msp.query('TEXT MTEXT'):
        text_val = entity.dxf.text if entity.dxftype()=='TEXT' else entity.text
        text_val = text_val.strip().replace('\n',' ').upper()
        if len(text_val)>2 and not text_val[0].isdigit():
            texts.append({'text':text_val,'x':entity.dxf.insert[0]*SCALE,'y':entity.dxf.insert[1]*SCALE})

    # --- Scan Rooms ---
    for entity in msp.query('LWPOLYLINE POLYLINE'):
        if "ROOM" in entity.dxf.layer.upper() or "FLOOR" in entity.dxf.layer.upper():
            if getattr(entity,"is_closed",False):
                with entity.points("xy") as pts:
                    scaled_pts=[(p[0]*SCALE,p[1]*SCALE) for p in pts]
                xs, ys = [p[0] for p in scaled_pts], [p[1] for p in scaled_pts]
                l, b = max(xs)-min(xs), max(ys)-min(ys)
                name="UNKNOWN"
                for t in texts:
                    if is_point_in_poly(t['x'],t['y'],scaled_pts):
                        name=t['text']; break
                results['rooms'].append({'name':name,'l':round(l,2),'b':round(b,2)})

    # --- Wall Segments ---
    wall_segments=[]
    for entity in msp.query('LINE LWPOLYLINE POLYLINE'):
        if "WALL" in entity.dxf.layer.upper():
            for s in get_segments(entity):
                wall_segments.append({
                    'start':(s['start'][0]*SCALE,s['start'][1]*SCALE),
                    'end':(s['end'][0]*SCALE,s['end'][1]*SCALE),
                    'len':math.dist(s['start'],s['end']),
                    'mid':((s['start'][0]+s['end'][0])/2,(s['start'][1]+s['end'][1])/2),
                    'angle':math.atan2(s['end'][1]-s['start'][1],s['end'][0]-s['start'][0]),
                    'matched':False
                })

    # --- Pair Walls ---
    for i,s1 in enumerate(wall_segments):
        if s1['matched'] or s1['len']<0.1: continue
        best_partner=None; thickness=0
        for j,s2 in enumerate(wall_segments):
            if i==j or s2['matched']: continue
            if abs((s1['angle']-s2['angle'])%math.pi)<ANGLE_TOLERANCE:
                gap=distance_point_line(s1['mid'][0],s1['mid'][1],s2['start'][0],s2['start'][1],s2['end'][0],s2['end'][1])
                if abs(gap-0.23)<TOLERANCE_THICKNESS: best_partner=s2; thickness=0.23; break
                elif abs(gap-0.15)<TOLERANCE_THICKNESS: best_partner=s2; thickness=0.15; break
        final_len=s1['len']
        if best_partner: s1['matched']=True; best_partner['matched']=True; final_len=(s1['len']+best_partner['len'])/2
        touching=is_touching_boundary(s1['mid'], boundary_points)
        if thickness==0.23: results['walls_outer_23_len' if touching else 'walls_inner_23_len']+=final_len
        elif thickness==0.15: results['walls_inner_15_len']+=final_len
        else: results['walls_outer_23_len' if touching else 'walls_inner_15_len']+=final_len/2

    # --- Openings ---
    for entity in msp.query('LINE LWPOLYLINE POLYLINE'):
        layer=entity.dxf.layer.upper()
        if "DOOR" in layer or "WINDOW" in layer:
            segs=get_segments(entity)
            length=sum(math.dist(s['start'],s['end'])*SCALE for s in segs)
            midx=sum((s['start'][0]+s['end'][0])/2 for s in segs)/len(segs)*SCALE
            midy=sum((s['start'][1]+s['end'][1])/2 for s in segs)/len(segs)*SCALE
            is_outer=is_touching_boundary((midx,midy), boundary_points)
            results['openings'].append({
                'type':'Door' if 'DOOR' in layer else 'Window',
                'width':round(length,2),
                'is_outer':is_outer
            })

    return results

# --- Flask Route ---
@app.route('/analyze-cad', methods=['POST'])
def analyze_cad():
    if 'file' not in request.files:
        return jsonify({"error":"No file"}),400
    file=request.files['file']
    path=os.path.join(os.getcwd(),"temp_"+file.filename)
    file.save(path)
    try:
        doc=ezdxf.readfile(path)
        data=analyze_cad_logic(doc.modelspace())
        if os.path.exists(path): os.remove(path)
        return jsonify(data)
    except Exception as e:
        if os.path.exists(path): os.remove(path)
        return jsonify({"error":str(e)}),500

if __name__=='__main__':
    app.run(debug=True,port=5000)
