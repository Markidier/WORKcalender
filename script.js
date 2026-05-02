document.addEventListener('DOMContentLoaded', () => {
    fetchData();
});

async function fetchData() {
    try {
        const response = await fetch('./data.json');
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        
        // 데이터 정렬 (날짜순)
        data.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        renderKeyEvents(data);
        renderAllEvents(data);
    } catch (error) {
        console.error('Failed to fetch data:', error);
        document.getElementById('key-events-container').innerHTML = '<p>데이터를 불러오는데 실패했습니다.</p>';
    }
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
    
    // 주요 일정만 필터링 (isKey === true)
    const keyEvents = events.filter(event => event.isKey);
    
    if (keyEvents.length === 0) {
        container.innerHTML = '<p class="subtitle">이번 달 주요 일정이 없습니다.</p>';
        return;
    }
    
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
    
    events.forEach(event => {
        const clone = template.content.cloneNode(true);
        
        clone.querySelector('.item-date').textContent = formatDate(event.date);
        clone.querySelector('.item-title').textContent = event.title;
        clone.querySelector('.item-desc').textContent = event.description;
        
        container.appendChild(clone);
    });
}
