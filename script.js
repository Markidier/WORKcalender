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
        localStorage.setItem('openaiKey', document.getElementById('openai-key').value.trim());
        localStorage.setItem('githubPat', document.getElementById('github-pat').value.trim());
        localStorage.setItem('githubRepo', document.getElementById('github-repo').value.trim());
        settingsModal.classList.add('hidden');
        alert('설정이 저장되었습니다!');
        fetchData(); // 새 설정으로 다시 데이터를 불러옵니다.
    });

    aiForm.addEventListener('submit', handleAISubmit);
}

function loadSettings() {
    const openaiKey = localStorage.getItem('openaiKey') || '';
    const githubPat = localStorage.getItem('githubPat') || '';
    const githubRepo = localStorage.getItem('githubRepo') || 'Markidier/WORKcalender';

    document.getElementById('openai-key').value = openaiKey;
    document.getElementById('github-pat').value = githubPat;
    document.getElementById('github-repo').value = githubRepo;
}

async function fetchData() {
    const githubPat = localStorage.getItem('githubPat');
    const githubRepo = localStorage.getItem('githubRepo') || 'Markidier/WORKcalender';

    try {
        let data = [];
        // GitHub PAT가 있으면 GitHub API를 통해 최신 데이터를 가져옵니다 (캐시 및 CORS 우회)
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
                // Base64 디코딩 (UTF-8 지원을 위해 decodeURIComponent 사용)
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
        document.getElementById('key-events-container').innerHTML = '<p>데이터를 불러오는데 실패했습니다. (로컬 환경 CORS 또는 설정 확인)</p>';
    }
}

async function fetchLocalData() {
    const response = await fetch('./data.json');
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.json();
}

function renderData() {
    // 날짜순 정렬
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
        
        // 날짜와 시간 함께 표시
        const dateObj = new Date(event.date);
        const timeStr = dateObj.getHours() > 0 ? ` ${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}` : '';
        
        clone.querySelector('.item-date').textContent = formatDate(event.date) + timeStr;
        clone.querySelector('.item-title').textContent = event.title;
        clone.querySelector('.item-desc').textContent = event.description;
        container.appendChild(clone);
    });
}

// AI 처리 로직
async function handleAISubmit(e) {
    e.preventDefault();
    const prompt = aiInput.value.trim();
    if (!prompt) return;

    const openaiKey = localStorage.getItem('openaiKey');
    const githubPat = localStorage.getItem('githubPat');
    const githubRepo = localStorage.getItem('githubRepo');

    if (!openaiKey || !githubPat) {
        alert('LLM 연동을 위해 우측 상단의 ⚙️ 설정 아이콘을 눌러 OpenAI API 키와 GitHub PAT를 먼저 입력해주세요.');
        settingsModal.classList.remove('hidden');
        return;
    }

    aiInput.value = '';
    loadingOverlay.classList.remove('hidden');

    try {
        // 1. OpenAI API 호출
        const newEvent = await parseEventWithLLM(prompt, openaiKey);
        
        // ID 부여
        newEvent.id = eventsData.length > 0 ? Math.max(...eventsData.map(e => e.id)) + 1 : 1;
        eventsData.push(newEvent);

        // 2. GitHub에 업데이트 (data.json 덮어쓰기)
        await saveToGitHub(githubPat, githubRepo, eventsData);
        
        // 3. UI 즉시 업데이트
        renderData();
        
    } catch (error) {
        console.error('AI 처리 중 오류 발생:', error);
        alert('처리 중 오류가 발생했습니다: ' + error.message);
    } finally {
        loadingOverlay.classList.add('hidden');
    }
}

async function parseEventWithLLM(userInput, apiKey) {
    const today = new Date();
    const systemPrompt = `You are a smart scheduling assistant. 
The user will give you a natural language command to add an event.
The current date and time is: ${today.toISOString()} (Korea Standard Time is UTC+9).
Analyze the input and return a raw JSON object containing the event details.
DO NOT wrap the response in markdown code blocks (\`\`\`json). Return ONLY the JSON object.

Required JSON format:
{
  "title": "Short, clear event title",
  "date": "YYYY-MM-DDTHH:mm:00",
  "description": "Brief description or any additional context mentioned. Keep it short.",
  "isKey": boolean (Set to true ONLY if the event sounds highly important like 'presentation', 'kickoff', 'release', 'key meeting', 'deadline'. Otherwise false.)
}

If the user mentions 'tomorrow', 'next week', etc., calculate the correct date based on the current date provided above. Make sure the time is logical if not specified (e.g. default to 09:00:00 or 12:00:00).`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userInput }
            ],
            temperature: 0.2
        })
    });

    if (!response.ok) {
        throw new Error('OpenAI API 호출 실패');
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    
    try {
        return JSON.parse(content);
    } catch (e) {
        // 혹시 마크다운 블록이 섞여있을 경우 처리
        const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanContent);
    }
}

// UTF-8 문자열을 Base64로 인코딩하는 헬퍼 함수
function utf8ToBase64(str) {
    return btoa(unescape(encodeURIComponent(str)));
}

async function saveToGitHub(pat, repo, newEventsData) {
    const apiUrl = `https://api.github.com/repos/${repo}/contents/data.json`;
    const updatedContent = JSON.stringify(newEventsData, null, 2);
    const base64Content = utf8ToBase64(updatedContent);

    // 최신 SHA를 먼저 가져옵니다 (동기화 충돌 방지)
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
            message: "Update schedule via LLM Assistant",
            content: base64Content,
            sha: sha
        })
    });

    if (!putRes.ok) {
        throw new Error('GitHub 데이터 저장 실패');
    }

    const putResult = await putRes.json();
    currentSha = putResult.content.sha; // 새 SHA 업데이트
}
