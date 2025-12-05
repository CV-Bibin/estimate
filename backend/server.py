from flask import Flask, request, jsonify
from flask_cors import CORS
import ezdxf
import uuid
import os
import logging

from analysis.config import CustomJSONProvider
from analysis.main_analyzer import analyze_strict
import ai_engine

app = Flask(__name__)
app.json_provider_class = CustomJSONProvider
CORS(app)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("DXF_ENGINE")

@app.route('/analyze-cad', methods=['POST'])
def analyze_cad():
    if 'file' not in request.files:
        return jsonify({"error": "No file"}), 400

    f = request.files['file']
    img = request.files.get('image_file')
    unit = request.form.get('unit', 'm')
    scale = {
        'mm': 0.001,
        'cm': 0.01,
        'm': 1.0,
        'ft': 0.3048
    }.get(unit.lower(), 1.0)

    sess_id = str(uuid.uuid4())
    d_path = f"uploads/{sess_id}.dxf"
    i_path = f"uploads/{sess_id}.jpg" if img else None

    os.makedirs("uploads", exist_ok=True)
    f.save(d_path)
    if img:
        img.save(i_path)

    try:
        doc = ezdxf.readfile(d_path)

        cad_data = analyze_strict(doc, scale)

        ai_result = ai_engine.generate_architectural_insight(cad_data, i_path)
        cad_data['ai_analysis'] = ai_result

        return jsonify(cad_data)

    except Exception as e:
        logger.error(e)
        return jsonify({"error": str(e)}), 500

    finally:
        if os.path.exists(d_path):
            os.remove(d_path)
        if i_path and os.path.exists(i_path):
            os.remove(i_path)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
