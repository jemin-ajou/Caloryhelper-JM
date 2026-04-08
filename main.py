import os
import json
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, JSONResponse
from dotenv import load_dotenv
import google.generativeai as genai
from PIL import Image
import io
import re

# .env 파일에서 환경 변수 로드
load_dotenv()

# 제미나이 API 키 설정
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("경고: GEMINI_API_KEY가 설정되지 않았습니다. .env 파일을 확인해 주세요.")

genai.configure(api_key=GEMINI_API_KEY)

app = FastAPI()

# 정적 파일 서빙 (HTML, CSS, JS)
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def read_index():
    with open("static/index.html", "r", encoding="utf-8") as f:
        return f.read()

@app.post("/analyze")
async def analyze_food(file: UploadFile = File(...)):
    """
    사용자가 업로드한 이미지를 받아 제미나이 API로 분석을 요청합니다.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="API 키가 설정되지 않았습니다.")

    try:
        # 이미지 데이터 읽기
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))

        # 제미나이 모델 설정 (Vision 모델 사용)
        # gemini-1.5-flash 가 404가 뜰 경우를 대비해 -latest를 붙여 시도
        model = genai.GenerativeModel('gemini-1.5-flash-latest')

        # 시스템 지시어 (System Instruction)
        system_instruction = (
            "당신은 '전문 임상 영양사'이자 '퍼스널 트레이너(운동 지도사)'입니다. "
            "사진 속 음식을 분석하여 다음 JSON 형식으로만 응답해 주세요. "
            "절대로 다른 설명글을 붙이지 마세요.\n\n"
            "{\n"
            "  \"dish_name\": \"요리명\",\n"
            "  \"total_calories\": \"숫자로만 표기(kcal 제외)\",\n"
            "  \"ingredients\": [\n"
            "    {\"name\": \"재료명\", \"amount\": \"분량(g)\", \"calories\": \"칼로리(kcal)\"}\n"
            "  ],\n"
            "  \"nutrition_summary\": {\n"
            "    \"carbs\": \"탄수화물 함량(숫자+g)\",\n"
            "    \"protein\": \"단백질 함량(숫자+g)\",\n"
            "    \"fat\": \"지방 함량(숫자+g)\"\n"
            "  },\n"
            "  \"daily_comparison\": {\n"
            "    \"carbs_pct\": \"성인 하루 권장량 대비 탄수화물 비율(숫자만)\",\n"
            "    \"carbs_target\": \"성인 하루 권장 탄수화물 수치(숫자+g)\",\n"
            "    \"protein_pct\": \"성인 하루 권장량 대비 단백질 비율(숫자만)\",\n"
            "    \"protein_target\": \"성인 하루 권장 단백질 수치(숫자+g)\",\n"
            "    \"fat_pct\": \"성인 하루 권장량 대비 지방 비율(숫자만)\",\n"
            "    \"fat_target\": \"성인 하루 권장 지방 수치(숫자+g)\"\n"
            "  },\n"
            "  \"exercise_guide\": [\n"
            "    {\"activity\": \"걷기\", \"duration\": \"소모분(숫자+분)\"},\n"
            "    {\"activity\": \"조깅\", \"duration\": \"소모분(숫자+분)\"},\n"
            "    {\"activity\": \"사이클링\", \"duration\": \"소모분(숫자+분)\"}\n"
            "  ],\n"
            "  \"tips_advice\": [\n"
            "    \"[영양사 조언] 해당 음식의 영양학적 장점 또는 주의할 점 (전문적이고 친절하게)\",\n"
            "    \"[운동학적 조언] 이 음식을 먹고 나서 하기 좋은 운동이나 공복 운동 팁 또는 근육 성장에 미치는 영향\",\n"
            "    \"[맞춤 팁] 더 건강하게 먹는 방법(조리법 변경 등) 또는 함께 먹으면 좋은 음식 조합\"\n"
            "  ]\n"
            "}"
        )

        # 분석 요청
        response = model.generate_content([system_instruction, image])
        
        # 응답 텍스트에서 JSON 추출 및 정제
        text_response = response.text.strip()
        
        # 마크다운 코드 블록 제거 로직 (더 견고하게)
        json_match = re.search(r'\{.*\}', text_response, re.DOTALL)
        if json_match:
            text_response = json_match.group(0)
        
        try:
            result = json.loads(text_response)
            
            # 숫자 데이터 클리닝 (문자열로 올 경우를 대비)
            if isinstance(result.get("total_calories"), str):
                result["total_calories"] = result["total_calories"].replace("kcal", "").strip()
                
            return result
        except json.JSONDecodeError:
            print(f"JSON Parsing Error. Raw Response: {text_response}")
            raise HTTPException(status_code=500, detail="AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.")

    except Exception as e:
        error_msg = str(e)
        if "429" in error_msg:
            return JSONResponse(
                status_code=429,
                content={"error": "현재 할당량이 초과되었습니다. 무료 티어의 경우 분당 요청 제한이 있으니 약 1분 후 다시 시도해 주세요."}
            )
        return JSONResponse(status_code=500, content={"error": f"분석 중 오류가 발생했습니다: {error_msg}"})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
