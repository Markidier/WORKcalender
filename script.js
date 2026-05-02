let eventsData = [];
let currentSha = null;

// DOM 요소
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');
const saveSettingsBtn = document.getElementById('save-settings');
const aiForm = document.getElementById('ai-form');
const aiInput = document.getElementById('ai-input');
const loadingOverlay = document.getElementById('loading-overlay');

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    fetchData();
    setupEventListeners();
});

function setupEventListeners() {
    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
    });

    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    saveSettingsBtn.addEventListener('click', () => {
        localStorage.setItem('githubPat', document.getElementById('github-pat').value.trim());
        localStorage.setItem('githubRepo', document.getElementById('github-repo').value.trim());
        settingsModal.classList.add('hidden');
        alert('설정이 저장되었습니다!');
        fetchData(); // 새 설정으로 다시 데이터를 불러옵니다.
    });

    aiForm.addEventListener('submit', handleAISubmit);
}

function loadSettings() {
    const githubPat = localStorage.getItem('githubPat') || '';
    const githubRepo = localStorage.getItem('githubRepo') || 'Markidier/WORKcalender';

    // UI 요소가 존재하는 경우에만 값 설정 (index.html에서 openai-key 필드가 삭제되었을 수 있으므로)
    const patInput = document.getElementById('github-pat');
    const repoInput = document.getElementById('github-repo');
    if(patInput) patInput.value = githubPat;
    if(repoInput) repoInput.value = githubRepo;
}

async function fetchData() {
    const githubPat = localStorage.getItem('githubPat');
    const githubRepo = localStorage.getItem('githubRepo') || 'Markidier/WORKcalender';

    try {
        let data = [];
        if (githubPat && githubRepo) {
            const response = await fetch(`https://api.github.com/repos/${githubRepo}/contents/data.json`, {
                headers: {
                    'Authorization': `Bearer ${githubPat}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (response.ok) {
                const result = await response.json();
                currentSha = result.sha;
                const jsonStr = decodeURIComponent(escape(atob(result.content)));
                data = JSON.parse(jsonStr);
            } else {
                console.warn('GitHub API로 데이터를 불러오지 못해 로컬 파일로 시도합니다.');
                data = await fetchLocalData();
            }
        } else {
            data = await fetchLocalData();
        }

        eventsData = data;
        renderData();
    } catch (error) {
        console.error('Failed to fetch data:', error);
        document.getElementById('key-events-container').innerHTML = '<p>데이터를 불러오는데 실패했습니다. (설정에서 GitHub 권한을 확인해주세요)</p>';
    }
}

async function fetchLocalData() {
    const response = await fetch('./data.json');
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.json();
}

function renderData() {
    const sortedData = [...eventsData].sort((a, b) => new Date(a.date) - new Date(b.date));
    renderKeyEvents(sortedData);
    renderAllEvents(sortedData);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}.${day}`;
}

function renderKeyEvents(events) {
    const container = document.getElementById('key-events-container');
    const template = document.getElementById('key-event-template');
    
    const keyEvents = events.filter(event => event.isKey);
    
    if (keyEvents.length === 0) {
        container.innerHTML = '<p class="subtitle">이번 달 주요 일정이 없습니다.</p>';
        return;
    }
    
    container.innerHTML = '';
    keyEvents.forEach(event => {
        const clone = template.content.cloneNode(true);
        clone.querySelector('.card-date').textContent = formatDate(event.date);
        clone.querySelector('.card-title').textContent = event.title;
        clone.querySelector('.card-desc').textContent = event.description;
        container.appendChild(clone);
    });
}

function renderAllEvents(events) {
    const container = document.getElementById('all-events-list');
    const template = document.getElementById('list-item-template');
    
    if (events.length === 0) {
        container.innerHTML = '<p class="subtitle" style="padding: 2rem 0;">등록된 일정이 없습니다.</p>';
        return;
    }
    
    container.innerHTML = '';
    events.forEach(event => {
        const clone = template.content.cloneNode(true);
        const dateObj = new Date(event.date);
        const timeStr = dateObj.getHours() > 0 ? ` ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}` : '';
        
        clone.querySelector('.item-date').textContent = formatDate(event.date) + timeStr;
        clone.querySelector('.item-title').textContent = event.title;
        clone.querySelector('.item-desc').textContent = event.description;
        container.appendChild(clone);
    });
}

// AI 처리 로직 (자체 자연어 엔진 사용)
async function handleAISubmit(e) {
    e.preventDefault();
    const prompt = aiInput.value.trim();
    if (!prompt) return;

    const githubPat = localStorage.getItem('githubPat');
    const githubRepo = localStorage.getItem('githubRepo');

    if (!githubPat) {
        alert('GitHub 동기화를 위해 우측 상단의 ⚙️ 설정 아이콘을 눌러 GitHub PAT를 입력해주세요.');
        settingsModal.classList.remove('hidden');
        return;
    }

    aiInput.value = '';
    loadingOverlay.classList.remove('hidden');

    try {
        // 1. 유료 API 없이 로컬 정규식 엔진으로 자연어 파싱
        const newEvent = parseEventLocal(prompt);
        
        // ID 부여
        newEvent.id = eventsData.length > 0 ? Math.max(...eventsData.map(e => e.id)) + 1 : 1;
        eventsData.push(newEvent);

        // 2. GitHub에 업데이트 (data.json 덮어쓰기)
        await saveToGitHub(githubPat, githubRepo, eventsData);
        
        // 3. UI 즉시 업데이트
        renderData();
        
    } catch (error) {
        console.error('처리 중 오류 발생:', error);
        alert('처리 중 오류가 발생했습니다: ' + error.message);
    } finally {
        loadingOverlay.classList.add('hidden');
    }
}

// 자체 자연어 분석 엔진 (LLM 대체)
function parseEventLocal(input) {
    const today = new Date();
    let targetDate = new Date(today);
    
    // 1. 날짜 추출
    if (input.includes('내일')) {
        targetDate.setDate(targetDate.getDate() + 1);
    } else if (input.includes('모레')) {
        targetDate.setDate(targetDate.getDate() + 2);
    } else {
        const dateMatch = input.match(/(\d+)월\s*(\d+)일/);
        if (dateMatch) {
            targetDate.setMonth(parseInt(dateMatch[1]) - 1);
            targetDate.setDate(parseInt(dateMatch[2]));
        }
    }

    // 2. 시간 추출
    let hours = 9; // 기본 9시
    let minutes = 0;
    
    const timeMatch = input.match(/(오전|오후)?\s*(\d+)시(?:\s*(\d+)분)?/);
    if (timeMatch) {
        let isPM = timeMatch[1] === '오후';
        let h = parseInt(timeMatch[2]);
        let m = timeMatch[3] ? parseInt(timeMatch[3]) : 0;
        
        if (isPM && h < 12) h += 12;
        if (timeMatch[1] === '오전' && h === 12) h = 0;
        
        hours = h;
        minutes = m;
    }
    
    targetDate.setHours(hours, minutes, 0, 0);

    // 3. 중요 이벤트(isKey) 판단
    const keyWords = ['회의', '발표', '미팅', '프로젝트', '킥오프', '마감', '중요'];
    const isKey = keyWords.some(kw => input.includes(kw));

    // 4. 제목 추출 (시간, 날짜 관련 단어 제거)
    let title = input
        .replace(/오늘|내일|모레/g, '')
        .replace(/(\d+)월\s*(\d+)일/g, '')
        .replace(/(오전|오후)?\s*(\d+)시(?:\s*(\d+)분)?/g, '')
        .replace(/잡아줘|추가해줘|등록해|일정|에/g, '')
        .trim();
        
    if (!title) title = "새로운 일정";

    // 날짜 포맷 (YYYY-MM-DDTHH:mm:00)
    const pad = n => String(n).padStart(2, '0');
    const dateString = `${targetDate.getFullYear()}-${pad(targetDate.getMonth()+1)}-${pad(targetDate.getDate())}T${pad(targetDate.getHours())}:${pad(targetDate.getMinutes())}:00`;

    return {
        title: title,
        date: dateString,
        description: input, 
        isKey: isKey
    };
}

function utf8ToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

async function saveToGitHub(pat, repo, newEventsData) {
    const apiUrl = `https://api.github.com/repos/${repo}/contents/data.json`;
    const updatedContent = JSON.stringify(newEventsData, null, 2);
    const base64Content = utf8ToBase64(updatedContent);

    const getRes = await fetch(apiUrl, {
        headers: {
            'Authorization': `Bearer ${pat}`,
            'Accept': 'application/vnd.github.v3+json'
        }
    });

    let sha = currentSha;
    if (getRes.ok) {
        const getResult = await getRes.json();
        sha = getResult.sha;
    }

    const putRes = await fetch(apiUrl, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${pat}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            message: "Update schedule via Smart Assistant",
            content: base64Content,
            sha: sha
        })
    });

    if (!putRes.ok) {
        throw new Error('GitHub 권한이 부족합니다. (저장소 오타 또는 쓰기 권한을 확인해주세요)');
    }

    const putResult = await putRes.json();
    currentSha = putResult.content.sha;
}
