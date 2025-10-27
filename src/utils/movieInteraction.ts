// Movie page interaction logic
export const initMovieInteractions = () => {
  // Add dialog close handlers
  document.querySelectorAll('.movie-dialog').forEach(dialog => {
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
        window.location.href = `/movies/year=${year}`;
      }
    });
  });

  // Add click handler for movie items
  document.querySelectorAll('.movie-item-btn').forEach(btn => {
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