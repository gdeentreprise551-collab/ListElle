import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getDatabase, ref, push, onValue, remove, set, update, get } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyDm2fPdpZxFXFUzstwuFylG1i9ruC3xxWs",
    authDomain: "listelle-2004.firebaseapp.com",
    databaseURL: "https://listelle-2004-default-rtdb.firebaseio.com",
    projectId: "listelle-2004",
    storageBucket: "listelle-2004.firebasestorage.app",
    messagingSenderId: "945966895827",
    appId: "1:945966895827:web:4ebd004cce8700610eba26",
    measurementId: "G-W9YC6S8NTJ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const ADMIN_EMAIL = "babajamila91@gmail.com";

let selectedUserEmail = null;
let currentTasksSnapshot = null;
let currentPeriodFilter = "all";

if (typeof emailjs !== 'undefined') {
    emailjs.init("NEHmHsWrbNiB3n5MN");
}

const showToast = (message, type = 'success') => {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:1000;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.style.cssText = `background:${type === 'error' ? '#e74c3c' : '#2ecc71'}; color:white; padding:12px 20px; margin-top:10px; border-radius:4px; box-shadow:0 4px 6px rgba(0,0,0,0.1); font-family:sans-serif; transition: all 0.3s;`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3500);
};

const initTheme = () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const themeBtn = document.getElementById('themeToggleBtn');
    if(themeBtn) themeBtn.innerText = savedTheme === 'dark' ? '☀️' : '🌙';
};

const toggleTheme = () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    const themeBtn = document.getElementById('themeToggleBtn');
    if(themeBtn) themeBtn.innerText = newTheme === 'dark' ? '☀️' : '🌙';
};

const createLog = (actionType, taskTitle, details = "") => {
    if (!auth.currentUser) return;
    
    const now = new Date();
    const dateFormatted = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeFormatted = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const fullTimestamp = `${dateFormatted} à ${timeFormatted}`;

    const logData = {
        userEmail: auth.currentUser.email,
        action: actionType,
        title: taskTitle,
        timestamp: fullTimestamp,
        details: details,
        createdAt: Date.now()
    };

    push(ref(db, 'logs'), logData).catch(e => console.log("Error creating log:", e));
};

// --- LOGIQUE DRAG AND DROP HANDLERS ---
let draggedTaskId = null;
let draggedTaskTitle = null;

const setupDragAndDropEvents = () => {
    const columns = document.querySelectorAll('.kanban-column');
    
    columns.forEach(column => {
        column.addEventListener('dragover', (e) => {
            e.preventDefault(); 
            column.classList.add('drag-over');
        });

        column.addEventListener('dragleave', () => {
            column.classList.remove('drag-over');
        });

        column.addEventListener('drop', async () => {
            column.classList.remove('drag-over');
            const newStatus = column.getAttribute('data-status');
            
            if (draggedTaskId && newStatus) {
                try {
                    await update(ref(db, `taches/${draggedTaskId}`), { status: newStatus });
                    showToast(`Statut mis à jour: ${newStatus}`);
                    createLog("modification", draggedTaskTitle, `Glissé vers: ${newStatus}`);
                } catch (err) {
                    showToast("Erreur de déplacement: " + err.message, "error");
                }
            }
        });
    });
};

window.showPage = (id) => {
    document.querySelectorAll('.sub-page').forEach(p => p.classList.add('hidden'));
    const target = document.getElementById(id);
    if(target) target.classList.remove('hidden');
};

window.prepareAddPage = (mode = 'list') => {
    if (mode === 'add') {
        document.getElementById('editTaskId').value = "";
        document.getElementById('editTaskOldTitle').value = "";
        document.getElementById('formPageTitle').innerText = "Ajouter une tâche";
        
        document.getElementById('taskInput').value = "";
        document.getElementById('detailsInput').value = "";
        document.getElementById('locationInput').value = "";
        document.getElementById('daysInput').value = "";
        document.getElementById('statusInput').value = "À faire";
        document.getElementById('calculatedDateDisplay').innerText = "-";
        
        const assignUserInput = document.getElementById('assignUserInput');
        if (assignUserInput) assignUserInput.value = "";
        
        window.showPage('addPage');
    } else {
        window.showPage('tasksPage');
    }
};

window.filterByUser = (email) => {
    selectedUserEmail = email;
    renderTasks();
    window.showPage('tasksPage');
};

window.setPeriodFilter = (period) => {
    currentPeriodFilter = period;
    document.querySelectorAll('.filter-btn-group button').forEach(btn => btn.classList.remove('active'));
    
    if (period === 'all') document.getElementById('btnFilterAll').classList.add('active');
    if (period === 'today') document.getElementById('btnFilterToday').classList.add('active');
    if (period === 'week') document.getElementById('btnFilterWeek').classList.add('active');
    if (period === 'overdue') document.getElementById('btnFilterOverdue').classList.add('active');
    
    renderTasks();
};

const renderTasks = () => {
    if (!currentTasksSnapshot || !auth.currentUser) return;
    
    const todoList = document.getElementById('todoList');
    const progressList = document.getElementById('progressList');
    const doneList = document.getElementById('doneList');
    
    todoList.innerHTML = "";
    progressList.innerHTML = "";
    doneList.innerHTML = "";

    let counts = { "À faire": 0, "En cours": 0, "Terminé": 0 };

    const user = auth.currentUser;
    const isAdmin = user.email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim();
    const searchBar = document.getElementById('searchBar');
    const searchWord = searchBar ? searchBar.value.toLowerCase().trim() : "";
    
    const todayStr = new Date().toISOString().split('T')[0];
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    const endOfWeekStr = sevenDaysLater.toISOString().split('T')[0];

    currentTasksSnapshot.forEach((child) => {
        const d = { id: child.key, ...child.val() };
        
        const taskUserEmail = d.userEmail ? d.userEmail.toLowerCase().trim() : "";
        const filterEmail = selectedUserEmail ? selectedUserEmail.toLowerCase().trim() : null;

        let matchesFilter = isAdmin ? (!filterEmail || taskUserEmail === filterEmail) : (d.userId === user.uid || taskUserEmail === user.email.toLowerCase().trim());
        
        if (searchWord && d.titre && !d.titre.toLowerCase().includes(searchWord)) {
            matchesFilter = false;
        }

        const taskStatus = d.status || "À faire";
        const taskDateStr = d.date || "";
        
        if (matchesFilter && currentPeriodFilter !== "all") {
            if (currentPeriodFilter === "today" && taskDateStr !== todayStr) {
                matchesFilter = false;
            } else if (currentPeriodFilter === "week" && (taskDateStr < todayStr || taskDateStr > endOfWeekStr)) {
                matchesFilter = false;
            } else if (currentPeriodFilter === "overdue") {
                if (taskDateStr >= todayStr || taskStatus === "Terminé") {
                    matchesFilter = false;
                }
            }
        }

        if (matchesFilter) {
            counts[taskStatus]++;
            const userDisplay = isAdmin ? `<small style="color: #3498db; font-weight:500;">Par/Pour: ${d.userEmail || "Inconnu"}</small>` : "";
            
            let badgeColor = "var(--status-todo)";
            let extraClass = "";
            if (taskStatus === "En cours") badgeColor = "var(--status-progress)";
            if (taskStatus === "Terminé") {
                badgeColor = "var(--status-done)";
                extraClass = "task-done";
            }

            const safeTitle = d.titre ? d.titre.replace(/'/g, "\\'") : "";
            const safeDetails = d.details ? d.details.replace(/'/g, "\\'") : "";
            const safeLocation = d.location ? d.location.replace(/'/g, "\\'") : "";
            const safeDate = d.date ? d.date.replace(/'/g, "\\'") : "";
            const safeStatus = taskStatus.replace(/'/g, "\\'");

            const isOverdueWarning = (taskDateStr < todayStr && taskStatus !== "Terminé") 
                ? `<span style="color:var(--danger-color); font-weight:bold; font-size:0.8rem; margin-left:5px;">⚠️ Retard</span>` 
                : "";

            const cardHTML = `
                <div class="task-card ${extraClass}" id="card-${d.id}" draggable="true">
                    <div class="task-info">
                        <strong style="color: var(--text-main); font-size:0.95rem;">${d.titre}</strong> ${isOverdueWarning} <br>
                        <small style="color:#7f8c8d; display:block; margin:2px 0;">📅 ${d.date}</small>
                        ${userDisplay}
                        <div><span class="status-badge" style="background: ${badgeColor};">${taskStatus}</span></div>
                    </div>
                    <div class="task-actions">
                        <button style="background:#34495e; color:white;" onclick="window.showDetails('${d.id}', '${safeTitle}', '${safeDetails}', '${safeLocation}', '${safeDate}', '${safeStatus}')">Détails</button>
                        <button style="background:#e67e22; color:white;" onclick="window.loadTaskToEdit('${d.id}', '${safeTitle}', '${safeDetails}', '${safeLocation}', '${safeDate}', '${safeStatus}')">✏️</button>
                        <button class="del-btn" onclick="window.del('${d.id}')">X</button>
                    </div>
                </div>`;

            if (taskStatus === "À faire") todoList.innerHTML += cardHTML;
            if (taskStatus === "En cours") progressList.innerHTML += cardHTML;
            if (taskStatus === "Terminé") doneList.innerHTML += cardHTML;
        }
    });

    const cTodo = document.getElementById('count-todo');
    const cProgress = document.getElementById('count-progress');
    const cDone = document.getElementById('count-done');
    
    if(cTodo) cTodo.innerText = `(${counts["À faire"]})`;
    if(cProgress) cProgress.innerText = `(${counts["En cours"]})`;
    if(cDone) cDone.innerText = `(${counts["Terminé"]})`;

    document.querySelectorAll('.task-card').forEach(card => {
        card.addEventListener('dragstart', () => {
            card.classList.add('dragging');
            draggedTaskId = card.id.replace('card-', '');
            const titleEl = card.querySelector('strong');
            draggedTaskTitle = titleEl ? titleEl.innerText : "Tâche";
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });
    });
};

window.loadTaskToEdit = (id, titre, details, location, date, status) => {
    document.getElementById('editTaskId').value = id;
    document.getElementById('editTaskOldTitle').value = titre === "undefined" ? "" : titre;
    document.getElementById('formPageTitle').innerText = "Modifier la tâche";
    
    document.getElementById('taskInput').value = titre === "undefined" ? "" : titre;
    document.getElementById('detailsInput').value = details === "undefined" ? "" : details;
    document.getElementById('locationInput').value = location === "undefined" ? "" : location;
    document.getElementById('statusInput').value = (status === "undefined" || !status) ? "À faire" : status;
    
    document.getElementById('daysInput').value = "";
    document.getElementById('calculatedDateDisplay').innerText = date;
    
    window.showPage('addPage');
};

const updateStats = (snapshot) => {
    const stats = {};
    const assignUserInput = document.getElementById('assignUserInput');
    let usersListOptions = `<option value="">-- Choisir un utilisateur (Optionnel) --</option>`;

    snapshot.forEach((child) => {
        const task = child.val();
        const email = task.userEmail ? task.userEmail.toLowerCase().trim() : "Inconnu";
        stats[email] = (stats[email] || 0) + 1;
    });

    const statsList = document.getElementById('statsList');
    if (statsList) {
        statsList.innerHTML = `<div style="cursor:pointer; color:var(--primary-color); margin-bottom:12px; font-weight:bold; display:inline-block;" onclick="window.filterByUser(null)">🔄 Voir tout</div>`;
        for (const [email, count] of Object.entries(stats)) {
            const activeStyle = (selectedUserEmail && selectedUserEmail.toLowerCase().trim() === email) ? 'background:rgba(137,157,176,0.15); font-weight:bold;' : '';
            statsList.innerHTML += `
                <div style="cursor:pointer; display:flex; justify-content:space-between; padding:8px; ${activeStyle}"
                     onclick="window.filterByUser('${email}')">
                    <span style="font-size:0.9em; color:var(--text-main);">${email}</span>
                    <span style="background:var(--primary-color); color:white; padding:2px 8px; border-radius:12px; font-size:0.8em;">${count} Tâches</span>
                </div>`;
            
            if (email !== "inconnu" && email !== ADMIN_EMAIL.toLowerCase().trim()) {
                usersListOptions += `<option value="${email}">${email}</option>`;
            }
        }
    }

    if (assignUserInput && assignUserInput.children.length <= 1) {
        assignUserInput.innerHTML = usersListOptions;
    }
};

const listenToLogs = () => {
    onValue(ref(db, 'logs'), (snapshot) => {
        const logsList = document.getElementById('logsList');
        if (!logsList) return;
        
        if (!snapshot.exists()) {
            logsList.innerHTML = `<p style="color:#aaa; text-align:center; margin:10px 0;">Aucune action enregistrée.</p>`;
            return;
        }

        let logsArray = [];
        snapshot.forEach((child) => { logsArray.push(child.val()); });
        logsArray.sort((a, b) => b.createdAt - a.createdAt);

        logsList.innerHTML = "";
        logsArray.forEach(log => {
            let color = "#3498db";
            let icon = "📝";
            if (log.action === "suppression") { color = "var(--danger-color)"; icon = "🗑️"; }
            if (log.action === "ajout") { color = "var(--success-color)"; icon = "➕"; }
            
            logsList.innerHTML += `
                <div class="log-item">
                    <strong>${log.timestamp}</strong> - <span style="color:${color}; font-weight:600;">${log.userEmail}</span><br>
                    <span style="font-weight:500;">${icon} ${log.action} :</span> "${log.title}" ${log.details ? `(${log.details})` : ""}
                </div>`;
        });
    });
};

const createNewUser = async () => {
    const email = document.getElementById('newUserEmail').value.trim();
    const password = document.getElementById('newUserPassword').value;
    if (!email || !password) { showToast("Merci de remplir tous les champs !", "error"); return; }
    
    try {
        await createUserWithEmailAndPassword(auth, email, password);
        await set(ref(db, 'users_allowed/' + email.replace(/\./g, "_")), true);
        showToast("Utilisateur créé avec succès !");
        document.getElementById('newUserEmail').value = "";
        document.getElementById('newUserPassword').value = "";
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') { showToast("Cet email est déjà utilisé !", "error"); } 
        else { showToast("Erreur: " + error.message, "error"); }
    }
};

window.calculateDate = () => {
    const daysInput = document.getElementById('daysInput');
    const display = document.getElementById('calculatedDateDisplay');
    
    let daysToAdd = parseInt(daysInput.value);

    if (isNaN(daysToAdd) || daysToAdd <= 0) {
        display.innerText = "-";
        return;
    }

    let baseDate = new Date();
    baseDate.setDate(baseDate.getDate() + daysToAdd);
    
    display.innerText = baseDate.toISOString().split('T')[0];
};

window.generateCalendarLink = (titre, details, location, dateStr, userEmail) => {
    const taskDate = new Date(dateStr);
    const formatDate = (d) => d.toISOString().replace(/-|:|\.\d+/g, "");
    
    let baseLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(titre)}&details=${encodeURIComponent(details)}&dates=${formatDate(taskDate)}/${formatDate(new Date(taskDate.getTime() + 3600000))}&location=${encodeURIComponent(location)}`;
    
    if(userEmail && userEmail.toLowerCase().trim() !== ADMIN_EMAIL.toLowerCase().trim()) {
        baseLink += `&add=${encodeURIComponent(userEmail)}`;
    }
    return baseLink;
};

window.showDetails = (id, t, d, l, date, status) => {
    alert(`Titre: ${t}\n\nStatut: ${status || 'À faire'}\n\nDétails: ${d}\n\nLocalisation: ${l || 'Non spécifiée'}`);
};

window.del = (id) => {
    if(confirm("Voulez-vous vraiment supprimer cette tâche ?")) {
        get(ref(db, 'taches/' + id)).then((snapshot) => {
            if (snapshot.exists()) {
                const taskTitle = snapshot.val().titre;
                remove(ref(db, 'taches/' + id))
                    .then(() => {
                        showToast("Tâche supprimée");
                        createLog("suppression", taskTitle);
                    })
                    .catch(err => showToast("Erreur: " + err.message, "error"));
            }
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    setupDragAndDropEvents(); 

    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if(themeToggleBtn) themeToggleBtn.onclick = toggleTheme;

    const searchBar = document.getElementById('searchBar');
    if(searchBar) searchBar.oninput = renderTasks;

    const loginBtn = document.getElementById('loginBtn');
    if(loginBtn) {
        loginBtn.onclick = () => {
            const email = document.getElementById('authEmail').value.trim();
            const pass = document.getElementById('authPassword').value;
            if(!email || !pass) { showToast("Veuillez remplir les champs", "error"); return;}
            signInWithEmailAndPassword(auth, email, pass)
                .then(() => showToast("Connexion réussie !"))
                .catch(err => showToast("Échec de connexion: " + err.message, "error"));
        };
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if(logoutBtn) {
        logoutBtn.onclick = () => {
            signOut(auth)
                .then(() => { 
                    showToast("Déconnexion réussie");
                    const loginForm = document.getElementById('loginForm');
                    if (loginForm) loginForm.reset(); 
                    document.getElementById('authEmail').removeAttribute('readonly');
                    document.getElementById('authPassword').removeAttribute('readonly');
                })
                .catch(err => showToast("Erreur: " + err.message, "error"));
        };
    }

    const createNewUserBtn = document.getElementById('createNewUserBtn');
    if(createNewUserBtn) createNewUserBtn.onclick = createNewUser;

    const addBtn = document.getElementById('addBtn');
    if(addBtn) {
        addBtn.onclick = () => {
            const finalDate = document.getElementById('calculatedDateDisplay').innerText;
            const taskInput = document.getElementById('taskInput');
            const editTaskId = document.getElementById('editTaskId').value;
            const statusInput = document.getElementById('statusInput').value;
            
            const assignUserInput = document.getElementById('assignUserInput');
            let assignedEmail = (assignUserInput && assignUserInput.value) ? assignUserInput.value.trim() : null;
            
            if (!taskInput.value || finalDate === "-" || finalDate === "") { 
                showToast("Merci de remplir les champs !", "error"); 
                return; 
            }

            const currentAdminOrUserEmail = auth.currentUser.email;
            const isAdmin = currentAdminOrUserEmail.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase