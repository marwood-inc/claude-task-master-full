const fs = require('fs');
const path = require('path');

const tasksPath = path.join(__dirname, '.taskmaster', 'tasks', 'tasks.json');
const data = JSON.parse(fs.readFileSync(tasksPath, 'utf8'));

// Get the feat-github-sync branch data
const branchData = data['feat-github-sync'];
if (!branchData || !branchData.tasks) {
  console.error('feat-github-sync branch not found');
  process.exit(1);
}

// Helper to find task by ID
function findTask(tasks, id) {
  for (const task of tasks) {
    if (task.id === id) return task;
    if (task.subtasks && task.subtasks.length > 0) {
      const found = findTask(task.subtasks, id);
      if (found) return found;
    }
  }
  return null;
}

// Find tasks 8, 9, and 10
const task8 = findTask(branchData.tasks, '8');
const task9 = findTask(branchData.tasks, '9');
const task10 = findTask(branchData.tasks, '10');

console.log('Before removal:');
console.log('Task 8 subtasks:', task8?.subtasks?.length || 0);
console.log('Task 9 subtasks:', task9?.subtasks?.length || 0);
console.log('Task 10 subtasks:', task10?.subtasks?.length || 0);

// Remove duplicate subtasks from task 8 (keep subtasks 1-3, remove 4-6)
if (task8 && task8.subtasks) {
  console.log('\nTask 8 subtasks before:');
  task8.subtasks.forEach(st => console.log(`  ${st.id}: ${st.title}`));
  task8.subtasks = task8.subtasks.filter(st => ['1', '2', '3'].includes(st.id));
  console.log('\nTask 8 subtasks after:');
  task8.subtasks.forEach(st => console.log(`  ${st.id}: ${st.title}`));
}

// Remove duplicate subtasks from task 9 (keep subtasks 1-4, remove 5-8)
if (task9 && task9.subtasks) {
  console.log('\nTask 9 subtasks before:');
  task9.subtasks.forEach(st => console.log(`  ${st.id}: ${st.title}`));
  task9.subtasks = task9.subtasks.filter(st => ['1', '2', '3', '4'].includes(st.id));
  console.log('\nTask 9 subtasks after:');
  task9.subtasks.forEach(st => console.log(`  ${st.id}: ${st.title}`));
}

console.log('\nAfter removal:');
console.log('Task 8 subtasks:', task8?.subtasks?.length || 0);
console.log('Task 9 subtasks:', task9?.subtasks?.length || 0);
console.log('Task 10 subtasks:', task10?.subtasks?.length || 0);

// Write back to file
fs.writeFileSync(tasksPath, JSON.stringify(data, null, 2), 'utf8');
console.log('\n✓ tasks.json updated successfully');
