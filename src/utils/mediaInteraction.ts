// Media page interaction logic
export const initMediaInteractions = () => {
  // Add dialog close handlers
  document.querySelectorAll('.media-dialog').forEach(dialog => {
    const closeBtn = dialog.querySelector('.close-dialog');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        (dialog as HTMLDialogElement).close();
      });
    }
    
    // Close when clicking outside the dialog
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        (dialog as HTMLDialogElement).close();
      }
    });
  });
  
  // Year navigation - click to navigate to a year page
  document.querySelectorAll('.year-nav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const year = btn.getAttribute('data-year');
      if (year) {
        window.location.href = `/media/year=${year}`;
      }
    });
  });

  // Add click handler for media items
  document.querySelectorAll('.media-item-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const dialogId = btn.getAttribute('data-dialog-id');
      
      if (dialogId) {
        const dialog = document.getElementById(dialogId) as HTMLDialogElement;
        if (dialog) {
          dialog.showModal();
        }
      }
    });
  });
};