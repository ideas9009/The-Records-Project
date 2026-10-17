// Explicit fixture preview only. Normal startup uses The Records Project server login.
export const PREVIEW_MODE=import.meta.env.VITE_PREVIEW_MODE==="true";
export const previewAccount={uid:"preview-sumeitideas",username:"Sumeitideas",role:"operator",status:"approved",createdAt:""} as const;
