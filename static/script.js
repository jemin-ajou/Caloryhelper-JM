const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const previewSection = document.getElementById('preview-section');
const uploadSection = document.getElementById('upload-section');
const imagePreview = document.getElementById('image-preview');
const retryBtn = document.getElementById('retry-btn');
const analyzeBtn = document.getElementById('analyze-btn');
const loadingSection = document.getElementById('loading-section');
const resultSection = document.getElementById('result-section');

const totalCaloriesEl = document.getElementById('total-calories');
const dishNameEl = document.getElementById('dish-name');
const tableBody = document.getElementById('result-table-body');
const resultImageView = document.getElementById('result-image-view');

let selectedFile = null;

// 클릭 업로드
dropZone.addEventListener('click', () => fileInput.click());

// 드래그 앤 드롭 이벤트
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
        handleFileSelection(e.dataTransfer.files[0]);
    }
});

// 파일 선택 이벤트
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileSelection(e.target.files[0]);
    }
});

function handleFileSelection(file) {
    if (!file.type.startsWith('image/')) {
        alert('이미지 파일만 업로드 가능합니다.');
        return;
    }
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        imagePreview.src = e.target.result;
        uploadSection.style.display = 'none';
        previewSection.style.display = 'block';
        
        // 부드러운 전환 애니메이션을 위한 클래스 추가
        previewSection.classList.add('fade-in');
    };
    reader.readAsDataURL(file);
}

// 다시 선택 버튼
retryBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // 부모 클릭 이벤트 전파 방지
    selectedFile = null;
    fileInput.value = '';
    previewSection.style.display = 'none';
    uploadSection.style.display = 'block';
});

// 분석하기 버튼
analyzeBtn.addEventListener('click', async () => {
    if (!selectedFile) return;

    previewSection.style.display = 'none';
    loadingSection.style.display = 'block';

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
        const response = await fetch('/analyze', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || errorData.detail || '분석 중 오류가 발생했습니다.');
        }

        const data = await response.json();
        displayResults(data);
    } catch (error) {
        let msg = error.message;
        // 특정 에러 키워드에 대한 한글 순화 (서버에서 이미 처리했지만 클라이언트 사이드 보강)
        if (msg.includes('Resource Exhausted') || msg.includes('429')) {
            msg = '현재 API 사용량이 초과되었습니다. 무료 버전은 분딩 요청 제한이 있으니 약 1분 후 다시 시도해 주세요.';
        }
        alert(msg);
        
        previewSection.style.display = 'block';
        loadingSection.style.display = 'none';
    }
});

function displayResults(data) {
    // 로딩 종료 및 결과 표시
    loadingSection.style.display = 'none';
    resultSection.style.display = 'block';

    // 업로드한 이미지를 결과창에도 표시
    resultImageView.src = imagePreview.src;

    // 총 칼로리 애니메이션
    const calValue = parseInt(String(data.total_calories).replace(/[^0-9]/g, '')) || 0;
    animateValue(totalCaloriesEl, 0, calValue, 1500);
    
    dishNameEl.textContent = data.dish_name || '분석된 요리명';

    // 1. 식재료 테이블 렌더링
    const ingredientsTableBody = document.getElementById('ingredients-table-body');
    ingredientsTableBody.innerHTML = '';
    
    if (data.ingredients && Array.isArray(data.ingredients)) {
        data.ingredients.forEach((item, index) => {
            const row = document.createElement('tr');
            row.style.animation = `fadeInUp 0.5s ease-out forwards ${index * 0.1}s`;
            row.style.opacity = '0';
            row.innerHTML = `
                <td><span class="ingredient-name">${item.name}</span></td>
                <td>${item.amount}</td>
                <td><span class="cal-badge">${item.calories}</span></td>
            `;
            ingredientsTableBody.appendChild(row);
        });
    }

    // 2. 영양 성분 요약 업데이트 & 일일 권장량 비율 표시
    const summary = data.nutrition_summary || {};
    const daily = data.daily_comparison || {};
    
    document.getElementById('summary-carbs').textContent = summary.carbs || '0g';
    document.getElementById('carbs-pct').textContent = (daily.carbs_pct || '0') + '%';
    document.getElementById('carbs-target').textContent = '하루 권장량: ' + (daily.carbs_target || '0g');
    
    document.getElementById('summary-protein').textContent = summary.protein || '0g';
    document.getElementById('protein-pct').textContent = (daily.protein_pct || '0') + '%';
    document.getElementById('protein-target').textContent = '하루 권장량: ' + (daily.protein_target || '0g');
    
    document.getElementById('summary-fat').textContent = summary.fat || '0g';
    document.getElementById('fat-pct').textContent = (daily.fat_pct || '0') + '%';
    document.getElementById('fat-target').textContent = '하루 권장량: ' + (daily.fat_target || '0g');

    // 3. 활동 소모 가이드 렌더링
    const exerciseContainer = document.getElementById('exercise-guide-container');
    exerciseContainer.innerHTML = '';
    
    if (data.exercise_guide && Array.isArray(data.exercise_guide)) {
        data.exercise_guide.forEach((item, index) => {
            const exerciseItem = document.createElement('div');
            exerciseItem.className = 'exercise-item';
            exerciseItem.style.animation = `fadeInUp 0.6s ease-out forwards ${index * 0.15 + 0.5}s`;
            exerciseItem.style.opacity = '0';
            
            const icon = getExerciseIcon(item.activity);
            
            exerciseItem.innerHTML = `
                <span class="exercise-icon">${icon}</span>
                <span class="exercise-name">${item.activity}</span>
                <span class="exercise-duration">${item.duration}</span>
            `;
            exerciseContainer.appendChild(exerciseItem);
        });
    }

    // 4. 영양 팁 & 건강 조언 렌더링
    const adviceContainer = document.getElementById('advice-container');
    adviceContainer.innerHTML = '';

    if (data.tips_advice && Array.isArray(data.tips_advice)) {
        data.tips_advice.forEach((tip, index) => {
            const adviceItem = document.createElement('div');
            adviceItem.className = 'advice-item';
            adviceItem.style.animation = `fadeInUp 0.6s ease-out forwards ${index * 0.2 + 0.8}s`;
            adviceItem.style.opacity = '0';
            adviceItem.innerHTML = `
                <span class="advice-icon">📌</span>
                <p class="advice-text">${tip}</p>
            `;
            adviceContainer.appendChild(adviceItem);
        });
    }
}

// 운동 종류별 이모지 매핑 함수
function getExerciseIcon(activity) {
    if (activity.includes('걷기')) return '🚶';
    if (activity.includes('조깅') || activity.includes('달리기')) return '🏃';
    if (activity.includes('사이클') || activity.includes('자전거')) return '🚴';
    if (activity.includes('수영')) return '🏊';
    if (activity.includes('등산')) return '🥾';
    return '🔥'; // 기본 아이콘
}

function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}
