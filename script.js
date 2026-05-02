let eventsData = [];
let currentSha = null;

// DOM 요소
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');
const saveSettingsBtn = document.getElementById('save-settings');

const editModal = document.getElementById('edit-modal');
const closeEditBtn = document.getElementById('close-edit');
const editForm = document.getElementById('edit-form');

const aiForm = document.getElementById('ai-form');
const aiInput = document.getElementById('ai-input');
const loadingOverlay = document.getElementById('loading-overlay');

document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    fetchData();
    setupEventListeners();
});

function setupEventListeners() {
    // 설정 모달
    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
    });

    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    saveSettingsBtn.addEventListener('click', () => {
        localStorage.setItem('geminiKey', document.getElementById('gemini-key').value.trim());
        localStorage.setItem('githubPat', document.getElementById('github-pat').value.trim());
        localStorage.setItem('githubRepo', document.getElementById('github-repo').value.trim());
        settingsModal.classList.add('hidden');
        alert('설정이 저장되었습니다!');
        fetchData();
    });

    // 수정 모달
    closeEditBtn.addEventListener('click', () => {
        editModal.classList.add('hidden');
    });

    editForm.addEventListener('submit', handleEditSubmit);

    // AI 폼
    aiForm.addEventListener('submit', handleAISubmit);
}

function loadSettings() {
    const geminiKey = localStorage.getItem('geminiKey') || '';
    const githubPat = localStorage.getItem('githubPat') || '';
    const githubRepo = localStorage.getItem('githubRepo') || 'Markidier/WORKcalender';

    const keyInput = document.getElementById('gemini-key');
    const patInput = document.getElementById('github-pat');
    const repoInput = document.getElementById('github-repo');
    if(keyInput) keyInput.value = geminiKey;
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

// 수정 및 삭제 이벤트 바인딩
function attachActionEvents(element, id) {
    const editBtn = element.querySelector('.edit-btn');
    const deleteBtn = element.querySelector('.delete-btn');

    if (editBtn) {
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openEditModal(id);
        });
    }

    if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm('이 일정을 정말 삭제하시겠습니까?')) {
                await deleteEvent(id);
            }
        });
    }
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
        
        attachActionEvents(clone, event.id);
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
        
        attachActionEvents(clone, event.id);
        container.appendChild(clone);
    });
}

// 수동 조작: 삭제
async function deleteEvent(id) {
    const githubPat = localStorage.getItem('githubPat');
    const githubRepo = localStorage.getItem('githubRepo');

    if (!githubPat) {
        alert('일정을 삭제하려면 GitHub 연동 설정이 필요합니다.');
        return;
    }

    loadingOverlay.classList.remove('hidden');
    document.getElementById('loading-text').textContent = '일정을 삭제하는 중...';

    try {
        eventsData = eventsData.filter(e => e.id !== id);
        await saveToGitHub(githubPat, githubRepo, eventsData);
        renderData();
    } catch (error) {
        console.error('삭제 오류:', error);
        alert('삭제 중 오류가 발생했습니다: ' + error.message);
    } finally {
        loadingOverlay.classList.add('hidden');
        document.getElementById('loading-text').textContent = '동기화 중입니다...';
    }
}

// 수동 조작: 수정 모달 열기
function openEditModal(id) {
    const event = eventsData.find(e => e.id === id);
    if (!event) return;

    document.getElementById('edit-id').value = event.id;
    document.getElementById('edit-title').value = event.title;
    
    // datetime-local 포맷 맞추기 (YYYY-MM-DDTHH:mm)
    const dateStr = event.date.substring(0, 16); 
    document.getElementById('edit-date').value = dateStr;
    
    document.getElementById('edit-desc').value = event.description;
    document.getElementById('edit-iskey').checked = event.isKey;

    editModal.classList.remove('hidden');
}

// 수동 조작: 수정 완료 처리
async function handleEditSubmit(e) {
    e.preventDefault();
    const githubPat = localStorage.getItem('githubPat');
    const githubRepo = localStorage.getItem('githubRepo');

    if (!githubPat) {
        alert('일정을 수정하려면 GitHub 연동 설정이 필요합니다.');
        return;
    }

    const id = parseInt(document.getElementById('edit-id').value);
    const title = document.getElementById('edit-title').value;
    const dateStr = document.getElementById('edit-date').value;
    const desc = document.getElementById('edit-desc').value;
    const isKey = document.getElementById('edit-iskey').checked;

    loadingOverlay.classList.remove('hidden');
    document.getElementById('loading-text').textContent = '수정 내역을 저장하는 중...';

    try {
        const eventIndex = eventsData.findIndex(e => e.id === id);
        if (eventIndex !== -1) {
            eventsData[eventIndex] = {
                id,
                title,
                date: dateStr + ':00', // 초 추가
                description: desc,
                isKey
            };
            
            await saveToGitHub(githubPat, githubRepo, eventsData);
            editModal.classList.add('hidden');
            renderData();
        }
    } catch (error) {
        console.error('수정 오류:', error);
        alert('수정 중 오류가 발생했습니다: ' + error.message);
    } finally {
        loadingOverlay.classList.add('hidden');
        document.getElementById('loading-text').textContent = '동기화 중입니다...';
    }
}

// AI 처리 로직 (Gemini API 사용)
async function handleAISubmit(e) {
    e.preventDefault();
    const prompt = aiInput.value.trim();
    if (!prompt) return;

    const geminiKey = localStorage.getItem('geminiKey');
    const githubPat = localStorage.getItem('githubPat');
    const githubRepo = localStorage.getItem('githubRepo');

    if (!geminiKey || !githubPat) {
        alert('AI 기능 사용을 위해 ⚙️ 설정에서 Gemini API Key와 GitHub PAT를 모두 입력해주세요.');
        settingsModal.classList.remove('hidden');
        return;
    }

    aiInput.value = '';
    loadingOverlay.classList.remove('hidden');
    document.getElementById('loading-text').textContent = 'AI가 일정을 분석하고 GitHub에 저장 중입니다...';

    try {
        // "모두 삭제", "다 삭제" 등의 수동 커맨드는 AI 호출 전 처리
        if (prompt.includes('모두 삭제') || prompt.includes('다 삭제') || prompt.includes('전부 삭제') || prompt.includes('초기화')) {
            eventsData = [];
        } else {
            const newEvent = await parseEventWithGemini(prompt, geminiKey);
            newEvent.id = eventsData.length > 0 ? Math.max(...eventsData.map(e => e.id)) + 1 : 1;
            eventsData.push(newEvent);
        }

        await saveToGitHub(githubPat, githubRepo, eventsData);
        renderData();
        
    } catch (error) {
        console.error('AI 처리 중 오류 발생:', error);
        alert('처리 중 오류가 발생했습니다: ' + error.message);
    } finally {
        loadingOverlay.classList.add('hidden');
    }
}

// Gemini API 연동
async function parseEventWithGemini(userInput, apiKey) {
    const today = new Date();
    const systemPrompt = `You are a smart scheduling assistant. 
The current date and time is: ${today.toISOString()} (Korea Standard Time is UTC+9).
Analyze the user's natural language command and return a raw JSON object with the event details.
DO NOT include markdown formatting like \`\`\`json. ONLY RETURN RAW JSON.

Required JSON format:
{
  "title": "Short, clear event title",
  "date": "YYYY-MM-DDTHH:mm:00",
  "description": "Brief description. Keep it short.",
  "isKey": boolean (true ONLY if the event sounds important like 'presentation', 'kickoff', 'release', 'key meeting', 'deadline'. Otherwise false.)
}

If the user mentions 'tomorrow', calculate the correct date based on the current date provided. If time is not specified, default to 09:00:00.

User input: ${userInput}`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: systemPrompt }]
            }]
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error ? errorData.error.message : 'Gemini API 호출 실패');
    }

    const data = await response.json();
    let content = data.candidates[0].content.parts[0].text.trim();
    
    try {
        // 혹시 마크다운 블록이 섞여있을 경우 처리
        content = content.replace(/```json/gi, '').replace(/```/g, '').trim();
        return JSON.parse(content);
    } catch (e) {
        console.error("Gemini JSON Parse Error:", content);
        throw new Error("AI가 유효한 형식으로 응답하지 않았습니다.");
    }
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
            message: "Update schedule (Edit/Delete/AI)",
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
