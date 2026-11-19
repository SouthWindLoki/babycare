// Preserve existing reference bookmarks after moving references into the dashboard.
const category = location.hash.slice(1);
location.replace(`/#references/${['vaccines', 'feeding', 'growth', 'development'].includes(category) ? category : 'vaccines'}`);
