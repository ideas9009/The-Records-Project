export type PointerPosition = {x:number; y:number};
// Hit-test the current geometry on scroll, rather than relying on cached CSS hover.
export function navigationAtPointer(nav: HTMLElement, pointer: PointerPosition): string | null {
 const bounds=nav.getBoundingClientRect();
 if(pointer.x<bounds.left || pointer.x>=bounds.right || pointer.y<bounds.top || pointer.y>=bounds.bottom)return null;
 for(const button of nav.querySelectorAll<HTMLButtonElement>("button[data-nav]")) {
   const box=button.getBoundingClientRect();
   if(pointer.x>=box.left && pointer.x<box.right && pointer.y>=box.top && pointer.y<box.bottom)
     return button.dataset.nav || null;
 }
 return null;
}
