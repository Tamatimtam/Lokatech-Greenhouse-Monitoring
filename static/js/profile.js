/**
 * Initialize a modal component
 * @param {string} modalId - The ID of the modal element
 * @param {string} openerId - The ID of the element that opens the modal
 * @param {Function} onSave - Optional callback function when save button is clicked
 */
function initModal(modalId, openerId, onSave = null) {
  const modal = document.getElementById(modalId);
  const opener = document.getElementById(openerId);
  const closeBtn = document.getElementById('close' + modalId);
  const cancelBtn = document.getElementById('cancel' + modalId);
  const saveBtn = document.getElementById('save' + modalId);
  
  if (!modal || !opener) {
    console.error(`Modal initialization failed: Elements not found. Modal: ${modalId}, Opener: ${openerId}`);
    return;
  }
  
  // Debug element selection
  console.log('Modal elements:', {
    modal: modal,
    opener: opener,
    closeBtn: closeBtn,
    cancelBtn: cancelBtn,
    saveBtn: saveBtn
  });
  
  // Open modal function
  function openModal() {
    console.log('Opening modal:', modalId);
    modal.classList.add('modal--active');
    document.body.style.overflow = 'hidden'; // Prevent scrolling when modal is open
  }
  
  // Close modal function
  function closeModal() {
    console.log('Closing modal:', modalId);
    modal.classList.remove('modal--active');
    document.body.style.overflow = ''; // Re-enable scrolling
  }
  
  // Event listeners
  opener.addEventListener('click', openModal);
  
  if (closeBtn) {
    closeBtn.addEventListener('click', closeModal);
    console.log('Close button click handler attached');
  } else {
    console.error(`Close button not found for modal ${modalId}`);
  }
  
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeModal);
    console.log('Cancel button click handler attached');
  } else {
    console.error(`Cancel button not found for modal ${modalId}`);
  }
  
  if (saveBtn) {
    saveBtn.addEventListener('click', function() {
      console.log('Save button clicked');
      if (onSave && typeof onSave === 'function') {
        onSave(modal, closeModal);
      } else {
        closeModal();
      }
    });
    console.log('Save button click handler attached');
  } else {
    console.error(`Save button not found for modal ${modalId}`);
  }
  
  // Close modal when clicking outside
  modal.addEventListener('click', function(event) {
    if (event.target === modal) {
      console.log('Modal background clicked, closing');
      closeModal();
    }
  });
  
  // Return control functions in case they're needed elsewhere
  return {
    open: openModal,
    close: closeModal
  };
}

// Register global Escape key handler for modals
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') {
    // Find all active modals and close them
    document.querySelectorAll('.modal--active').forEach(activeModal => {
      console.log('Closing modal via Escape key');
      activeModal.classList.remove('modal--active');
      document.body.style.overflow = '';
    });
  }
});
