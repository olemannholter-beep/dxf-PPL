/**
 * Toast Notification Utility
 */
export function showToast(msg) {
  const toastPopup = document.getElementById('toast-popup');
  if (!toastPopup) return;
  toastPopup.textContent = msg;
  toastPopup.classList.add('visible');
  clearTimeout(toastPopup._timer);
  toastPopup._timer = setTimeout(() => toastPopup.classList.remove('visible'), 2800);
}
