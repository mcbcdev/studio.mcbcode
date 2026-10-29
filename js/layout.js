// ================= sidebar resizing + snap-close =================
  const sidebarWrap = document.getElementById('sidebar-wrap');
  const sidebar = document.getElementById('sidebar');
  const sidebarResizer = document.getElementById('sidebar-resizer');

  const SIDEBAR_MIN = 120;   // below this while dragging, it snaps closed
  const SIDEBAR_MAX = 480;
  const SIDEBAR_SNAP_CLOSED_AT = 70; // px width that counts as "small enough to snap shut"
  const SIDEBAR_REOPEN_WIDTH = 220;  // width restored when re-expanded from collapsed

  let isDraggingSidebar = false;

  sidebarResizer.addEventListener('mousedown', (e) => {
    // if collapsed, clicking the resizer re-opens the sidebar instead of dragging from 0
    if (sidebarWrap.classList.contains('collapsed')) {
      sidebarWrap.classList.remove('collapsed');
      sidebar.style.width = SIDEBAR_REOPEN_WIDTH + 'px';
      return;
    }
    isDraggingSidebar = true;
    sidebarResizer.classList.add('dragging');
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDraggingSidebar) return;

    const activityBarWidth = document.getElementById('activity-bar').offsetWidth;
    let newWidth = e.clientX - activityBarWidth;

    if (newWidth < SIDEBAR_SNAP_CLOSED_AT) {
      sidebarWrap.classList.add('collapsed');
      return;
    }
    sidebarWrap.classList.remove('collapsed');
    newWidth = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, newWidth));
    sidebar.style.width = newWidth + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!isDraggingSidebar) return;
    isDraggingSidebar = false;
    sidebarResizer.classList.remove('dragging');
    document.body.style.userSelect = '';
  });
