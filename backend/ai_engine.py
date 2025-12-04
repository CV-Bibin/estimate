import google.generativeai as genai
import os
import json
import logging
import PIL.Image

logger = logging.getLogger("AI_ENGINE")
logging.basicConfig(level=logging.INFO)

API_KEY = os.environ.get("GEMINI_API_KEY", "XXXXXXXXXXXXXXX")

def get_default_response():
    """Returns a fresh default response structure to avoid shared state issues."""
    return {
        "corrected_stats": {
            "plinth_area": "-",
            "carpet_area": "-",
            "counts": {
                "doors": 0,
                "windows": 0,
                "ventilators": 0
            }
        },
        "corrected_rooms": [],
        "visual_notes": ""
    }

def configure_genai():
    if not API_KEY: return False
    try:
        genai.configure(api_key=API_KEY)
        return True
    except: return False

def generate_architectural_insight(cad_data, image_path=None):
    # Initialize result with a fresh default structure
    result = get_default_response()
    
    if not configure_genai(): 
        result["visual_notes"] = "AI not configured."
        return result

    try:
        model = genai.GenerativeModel('gemini-2.5-flash-preview-09-2025', generation_config={"response_mime_type": "application/json"})
        
        # SAFE DATA EXTRACTION: use .get() to prevent KeyError 'counts'
        boq = cad_data.get('boq', {})
        counts = cad_data.get('counts', {'doors':0, 'windows':0, 'ventilators':0})
        rooms = cad_data.get('rooms', [])

        prompt_data = {
            "cad_summary": {
                "plinth_area": boq.get('slab_area', 0),
                "carpet_area": boq.get('carpet_area', 0),
                "counts": counts,
                "rooms": rooms
            }
        }

        base_prompt = f"""
        You are an AI Quantity Surveyor.
        
        **INPUT DATA (Extracted from DXF):**
        {json.dumps(prompt_data, indent=2)}
        
        **TASK:**
        1. Analyze the FLOOR PLAN IMAGE (if provided) and the INPUT DATA.
        2. Generate a "Corrected" dataset. 
           - The Input Data might be ZERO if the extraction script missed the items (e.g. gaps in walls instead of door symbols).
           - YOUR JOB IS TO VISUALLY COUNT THE REAL ITEMS.
           - Map openings to rooms visually.
        
        **OUTPUT JSON SCHEMA (Strict):**
        {{
            "corrected_stats": {{
                "plinth_area": (Number or String with unit),
                "carpet_area": (Number or String with unit),
                "counts": {{
                    "doors": (Int),
                    "windows": (Int),
                    "ventilators": (Int)
                }}
            }},
            "corrected_rooms": [
                {{
                    "name": "Room Name",
                    "area": "Area m2",
                    "dims": "L x B",
                    "openings_attached": ["Door (0.9m)", "Window (1.2m)", "Ventilator (0.6m)"]
                }}
            ],
            "visual_notes": "Short text summary of any errors found."
        }}
        """
        
        content = [base_prompt]
        if image_path and os.path.exists(image_path):
            try:
                content.append(PIL.Image.open(image_path))
                content.append("""
                **VISUAL CLASSIFICATION RULES**:
                1. **DOOR**: Standard door symbols OR clear gaps in walls without dotted lines.
                2. **WINDOW**: Parallel lines/blocks on walls in Bedrooms, Halls, Kitchens.
                3. **VENTILATOR**: Small window-like symbols found specifically in **TOILETS, BATHROOMS, or W.C.**
                4. **OPENING (Passage)**: Gaps with dotted lines crossing them. Do NOT count these as doors.
                """)
            except: pass

        resp = model.generate_content(content)
        
        # Clean response
        text_resp = resp.text.strip()
        if text_resp.startswith("```json"):
            text_resp = text_resp[7:]
        if text_resp.endswith("```"):
            text_resp = text_resp[:-3]
            
        data = json.loads(text_resp)
        
        # Merge AI data into result structure safely
        if 'corrected_stats' in data and isinstance(data['corrected_stats'], dict):
            # Safe merge of counts
            ai_counts = data['corrected_stats'].get('counts')
            if isinstance(ai_counts, dict):
                result['corrected_stats']['counts']['doors'] = ai_counts.get('doors', 0)
                result['corrected_stats']['counts']['windows'] = ai_counts.get('windows', 0)
                result['corrected_stats']['counts']['ventilators'] = ai_counts.get('ventilators', 0)
            
            # Safe merge of areas
            if 'plinth_area' in data['corrected_stats']:
                result['corrected_stats']['plinth_area'] = data['corrected_stats']['plinth_area']
            if 'carpet_area' in data['corrected_stats']:
                result['corrected_stats']['carpet_area'] = data['corrected_stats']['carpet_area']
                
        if 'corrected_rooms' in data and isinstance(data['corrected_rooms'], list):
            result['corrected_rooms'] = data['corrected_rooms']
            
        if 'visual_notes' in data:
            result['visual_notes'] = data['visual_notes']
            
        return result

    except Exception as e:
        logger.error(f"AI Error: {e}")
        # Return the safe default structure with the error message
        result["visual_notes"] = f"AI Error: {str(e)}"
        return result
