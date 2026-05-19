// API Base URL
const API_BASE = 'http://localhost:3000/api';

// Global variables
let currentUser = null;
let authToken = null;

// Check if user is logged in
function checkAuth() {
    const token = localStorage.getItem('authToken');
    const user = localStorage.getItem('currentUser');
    
    if (token && user) {
        authToken = token;
        currentUser = JSON.parse(user);
        return true;
    }
    return false;
}

// Set auth data
function setAuth(token, user) {
    authToken = token;
    currentUser = user;
    localStorage.setItem('authToken', token);
    localStorage.setItem('currentUser', JSON.stringify(user));
    updateNavVisibility();
}

// Clear auth data
function clearAuth() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    updateNavVisibility();
}

// Logout function
function logout() {
    clearAuth();
    showPage('login');
}

// Update navigation visibility based on auth status
function updateNavVisibility() {
    const userInfo = document.getElementById('userInfo');
    const userName = document.getElementById('userName');
    const loginLink = document.getElementById('loginLink').parentElement;
    const signupLink = document.getElementById('signupLink').parentElement;
    
    if (currentUser) {
        userInfo.style.display = 'block';
        userName.textContent = `مرحباً ${currentUser.name}`;
        loginLink.style.display = 'none';
        signupLink.style.display = 'none';
    } else {
        userInfo.style.display = 'none';
        loginLink.style.display = 'block';
        signupLink.style.display = 'block';
    }
}

// Make authenticated request
async function authenticatedFetch(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    const response = await fetch(url, {
        ...options,
        headers
    });
    
    if (response.status === 401) {
        clearAuth();
        showPage('login');
        throw new Error('انتهت صلاحية الجلسة');
    }
    
    return response;
}

// Page Navigation
function showPage(pageName) {
    // Check authentication for protected pages
    const protectedPages = ['dashboard', 'materials'];
    
    if (protectedPages.includes(pageName) && !checkAuth()) {
        showPage('login');
        return;
    }
    
    // Hide all pages
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => page.classList.remove('active'));

    // Show selected page
    const selectedPage = document.getElementById(pageName);
    if (selectedPage) {
        selectedPage.classList.add('active');
        window.scrollTo(0, 0);
        
        // Load data for specific pages
        if (pageName === 'materials') {
            loadFiles();
        }
    }
}

// File Upload Handler
function handleFileUpload(event) {
    const file = event.target.files[0];
    const subjectSelect = document.getElementById('uploadSubjectSelect');
    const fileTypeSelect = document.getElementById('uploadFileTypeSelect');
    const subjectCode = subjectSelect ? subjectSelect.value : '';
    const fileType = fileTypeSelect ? fileTypeSelect.value : 'material';

    if (!subjectCode) {
        alert('يرجى اختيار المادة قبل رفع الملف');
        return;
    }

    if (file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('subjectCode', subjectCode);
        formData.append('fileType', fileType);

        // Show loading
        const uploadBtn = document.querySelector('.upload-box button');
        const originalText = uploadBtn.textContent;
        uploadBtn.textContent = 'جاري الرفع...';
        uploadBtn.disabled = true;

        fetch(`${API_BASE}/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${authToken}`
            },
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                alert('خطأ: ' + data.error);
            } else {
                alert('✅ تم رفع الملف بنجاح: ' + data.originalName);
                loadFiles(); // Reload files list
            }
        })
        .catch(error => {
            console.error('Upload error:', error);
            alert('فشل في رفع الملف. تأكد من تسجيل الدخول.');
        })
        .finally(() => {
            uploadBtn.textContent = originalText;
            uploadBtn.disabled = false;
        });
    }
}

// Send a test chat request through the backend proxy
async function sendChatTest() {
    const input = document.getElementById('chatInput').value.trim();
    const resultDiv = document.getElementById('chatResult');

    if (!input) {
        alert('يرجى إدخال نص للاختبار');
        return;
    }

    resultDiv.textContent = 'جاري إرسال الطلب...';

    try {
        const response = await fetch(`${API_BASE}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ inputs: input })
        });

        const data = await response.json();

        if (!response.ok) {
            resultDiv.textContent = `خطأ: ${data.error || response.statusText}`;
            return;
        }

        resultDiv.textContent = JSON.stringify(data, null, 2);
    } catch (error) {
        console.error('Chat request failed:', error);
        resultDiv.textContent = 'فشل في الاتصال بالخادم أو نقطة النهاية الخارجية.';
    }
}

// Load subjects from backend
function loadSubjects() {
    authenticatedFetch(`${API_BASE}/courses`)
    .then(response => response.json())
    .then(courses => {
        populateSubjectSelects(courses);
    })
    .catch(error => {
        console.error('Load subjects error:', error);
    });
}

function populateSubjectSelects(courses) {
    const uploadSubjectSelect = document.getElementById('uploadSubjectSelect');
    const examSubjectSelect = document.getElementById('examSubjectSelect');

    if (!uploadSubjectSelect || !examSubjectSelect) return;

    const options = ['<option value="">اختر المادة...</option>'];
    courses.forEach(course => {
        options.push(`<option value="${course.code}">${course.code} - ${course.name}</option>`);
    });

    uploadSubjectSelect.innerHTML = options.join('');
    examSubjectSelect.innerHTML = options.join('');
}

// Load files from backend
function loadFiles() {
    authenticatedFetch(`${API_BASE}/files`)
    .then(response => response.json())
    .then(files => {
        const filesList = document.getElementById('filesList');
        filesList.innerHTML = '';

        if (files.length === 0) {
            filesList.innerHTML = '<div class="file-item" style="justify-content: center; color: #999;">لا توجد ملفات مرفوعة بعد</div>';
            populateFileSelects([]);
            return;
        }

        files.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';

            const today = new Date(file.uploadDate);
            const dateStr = today.toLocaleDateString('ar-EG') + ' • ' + today.toLocaleTimeString('ar-EG');

            fileItem.innerHTML = `
                <span class="file-icon">📄</span>
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-date">${dateStr}</div>
                </div>
            `;

            filesList.appendChild(fileItem);
        });

        populateFileSelects(files);
    })
    .catch(error => {
        console.error('Load files error:', error);
        const filesList = document.getElementById('filesList');
        filesList.innerHTML = '<div class="file-item" style="justify-content: center; color: #999;">فشل في تحميل الملفات</div>';
        populateFileSelects([]);
    });
}

function populateFileSelects(files) {
    const summarySelect = document.querySelector('#fromLibrary .select-file');
    const examSelect = document.getElementById('examFileSelect');
    const fileOptions = ['<option value="">اختر ملفاً...</option>'];

    files.forEach(file => {
        fileOptions.push(`<option value="${file.id}">${file.name}</option>`);
    });

    if (summarySelect) {
        summarySelect.innerHTML = fileOptions.join('');
    }
    if (examSelect) {
        examSelect.innerHTML = fileOptions.join('');
    }
}

// Authentication Functions
function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        alert('يرجى ملء جميع الحقول');
        return;
    }

    fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('خطأ: ' + data.error);
        } else {
            setAuth(data.token, data.user);
            alert('✅ ' + data.message);
            showPage('dashboard');
        }
    })
    .catch(error => {
        console.error('Login error:', error);
        alert('فشل في تسجيل الدخول');
    });
}

function handleSignup(event) {
    event.preventDefault();
    
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;
    
    if (!name || !email || !password || !confirmPassword) {
        alert('يرجى ملء جميع الحقول');
        return;
    }
    
    if (password !== confirmPassword) {
        alert('كلمة المرور غير متطابقة');
        return;
    }

    fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, email, password })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            alert('خطأ: ' + data.error);
        } else {
            setAuth(data.token, data.user);
            alert('✅ ' + data.message);
            showPage('dashboard');
        }
    })
    .catch(error => {
        console.error('Signup error:', error);
        alert('فشل في إنشاء الحساب');
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    if (checkAuth()) {
        showPage('dashboard');
        loadSubjects();
    } else {
        showPage('login');
    }
    
    updateNavVisibility();
    
    // Add form event listeners
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
    }
});
