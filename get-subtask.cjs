const fs = require('fs');

const data = JSON.parse(fs.readFileSync('.taskmaster/tasks/tasks.json', 'utf-8'));
const taskId = process.argv[2] || '4';
const subtaskId = process.argv[3] || '1';

// Handle both array and non-array formats
const tasks = Array.isArray(data) ? data : (data.tasks || []);
const task = tasks.find(t => t.id === taskId);

if (!task) {
  console.error(`Task ${taskId} not found`);
  process.exit(1);
}

const subtask = task.subtasks?.find(s => s.id === subtaskId);

if (!subtask) {
  console.error(`Subtask ${subtaskId} not found in task ${taskId}`);
  process.exit(1);
}

console.log(JSON.stringify(subtask, null, 2));
