import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    updateDoc, 
    deleteDoc,
    getDoc,
    query,
    orderBy
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDBKCotY1F943DKfVQqKOGPPkAkQe2Zgog",
  authDomain: "beach-trivia-website.firebaseapp.com",
  projectId: "beach-trivia-website",
  storageBucket: "beach-trivia-website.firebasestorage.app",
  messagingSenderId: "459479368322",
  appId: "1:459479368322:web:7bd3d080d3b9e77610aa9b",
  measurementId: "G-24MQRKKDNY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// DOM Elements
const modal = document.getElementById('employeeModal');
const form = document.getElementById('employeeForm');
const tableBody = document.getElementById('employeesTableBody');
const saveButton = document.getElementById('saveEmployee');
const cancelButton = document.getElementById('cancelEdit');
const addNewEmployeeBtn = document.getElementById('addNewEmployeeBtn');
const closeModalBtn = document.querySelector('.close-modal');

// Modal Functions
function openModal(isEditing = false) {
    // If not editing, ensure the form is reset
    if (!isEditing) {
        form.reset();
        document.getElementById('employeeId').value = '';
    }
    
    // Display the modal
    modal.style.display = 'block';
}

function closeModal() {
    // Hide the modal
    modal.style.display = 'none';
    
    // Always reset the form when closing the modal
    // This ensures a clean slate for the next time the modal is opened
    form.reset();
    document.getElementById('employeeId').value = '';
}

// Fetch and Display Employees
async function fetchEmployees() {
    tableBody.innerHTML = ''; // Clear existing rows
    try {
        const querySnapshot = await getDocs(collection(db, 'employees'));
        
        querySnapshot.forEach((document) => {
            const employee = document.data();
            
            const row = tableBody.insertRow();
            row.innerHTML = `
                <td>${employee.firstName || ''} ${employee.lastName || ''}</td>
                <td>${employee.email || ''}</td>
                <td>${employee.employeeID || 'UNKNOWN'}</td>
                <td>${employee.active === true ? 'Yes' : 'No'}</td>
                <td>
                    <button class="edit-btn" data-id="${document.id}">Edit</button>
                    <button class="delete-btn" data-id="${document.id}">Delete</button>
                </td>
            `;
        });

        // Remove existing event listeners and add new ones
        tableBody.querySelectorAll('.edit-btn').forEach(btn => {
            // Clone the button to remove all existing event listeners
            const oldBtn = btn;
            const newBtn = oldBtn.cloneNode(true);
            oldBtn.parentNode.replaceChild(newBtn, oldBtn);
            
            // Add new event listener
            newBtn.addEventListener('click', (e) => {
                console.log('Edit button clicked, ID:', e.target.dataset.id);
                editEmployee(e.target.dataset.id);
            });
        });

        tableBody.querySelectorAll('.delete-btn').forEach(btn => {
            // Clone the button to remove all existing event listeners
            const oldBtn = btn;
            const newBtn = oldBtn.cloneNode(true);
            oldBtn.parentNode.replaceChild(newBtn, oldBtn);
            
            // Add new event listener
            newBtn.addEventListener('click', () => deleteEmployee(btn.dataset.id));
        });
    } catch (error) {
        console.error("Error fetching employees: ", error);
        alert('Failed to fetch employees. Check console for details.');
    }
}

// Add or Update Employee
async function saveEmployee(e) {
    e.preventDefault();
    
    // Prepare employee data
    const employeeData = {
        firstName: document.getElementById('firstName').value,
        lastName: document.getElementById('lastName').value,
        email: document.getElementById('email').value,
        phone: document.getElementById('phone').value,
        nickname: document.getElementById('nickname').value,
        employeeID: document.getElementById('employeeID').value,
        emergencyContactName: document.getElementById('emergencyContactName').value,
        emergencyContactPhone: document.getElementById('emergencyContactPhone').value,
        active: document.getElementById('active').value === 'true' // Explicitly convert to boolean
    };

    try {
        const employeeId = document.getElementById('employeeId').value;
        
        if (employeeId) {
            // Update existing employee
            const employeeRef = doc(db, 'employees', employeeId);
            await updateDoc(employeeRef, employeeData);
            alert('Employee updated successfully!');
        } else {
            // Add new employee
            const docRef = await addDoc(collection(db, 'employees'), employeeData);
            alert('Employee added successfully!');
        }

        // Close modal and refresh table
        closeModal(); // This will also reset the form
        fetchEmployees();
    } catch (error) {
        console.error("Error saving employee: ", error);
        alert('Failed to save employee. Check console for details.');
    }
}

// Edit Employee
async function editEmployee(id) {
    try {
        console.log('Editing employee with ID:', id);
        const employeeRef = doc(db, 'employees', id);
        const employeeSnap = await getDoc(employeeRef);
        
        if (employeeSnap.exists()) {
            const employee = employeeSnap.data();
            console.log('Employee data:', employee);
            
            // First, reset the form to clear any previous data
            form.reset();
            
            // Then open the modal - we don't need the isEditing parameter anymore
            // since we're explicitly managing the form state here
            modal.style.display = 'block';
            
            // Then populate form with employee data
            document.getElementById('firstName').value = employee.firstName || '';
            document.getElementById('lastName').value = employee.lastName || '';
            document.getElementById('email').value = employee.email || '';
            document.getElementById('phone').value = employee.phone || '';
            document.getElementById('nickname').value = employee.nickname || '';
            document.getElementById('employeeID').value = employee.employeeID || '';
            document.getElementById('emergencyContactName').value = employee.emergencyContactName || '';
            document.getElementById('emergencyContactPhone').value = employee.emergencyContactPhone || '';
            document.getElementById('active').value = employee.active ? 'true' : 'false';

            // Set the hidden employeeId field
            document.getElementById('employeeId').value = id;
        } else {
            console.log('No employee found with this ID');
        }
    } catch (error) {
        console.error("Error fetching employee details: ", error);
        alert('Failed to fetch employee details. Check console for details.');
    }
}

// Delete Employee
async function deleteEmployee(id) {
    if (confirm('Are you sure you want to delete this employee?')) {
        try {
            await deleteDoc(doc(db, 'employees', id));
            alert('Employee deleted successfully!');
            fetchEmployees();
        } catch (error) {
            console.error("Error deleting employee: ", error);
            alert('Failed to delete employee. Check console for details.');
        }
    }
}

// Cancel Edit
function cancelEdit() {
    closeModal();
}

// Event Listeners
form.addEventListener('submit', saveEmployee);
cancelButton.addEventListener('click', cancelEdit);
addNewEmployeeBtn.addEventListener('click', () => openModal(false)); // Explicitly set isEditing to false
closeModalBtn.addEventListener('click', closeModal);

// Close modal if clicked outside
window.addEventListener('click', (event) => {
    if (event.target === modal) {
        closeModal();
    }
});

// Initial fetch of employees
fetchEmployees();
