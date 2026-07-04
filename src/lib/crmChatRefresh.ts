/** Cross-component signal to reload one lead's chat (useCrmStore listens). */
export const CRM_REFRESH_LEAD_CHATS = "crm:refresh-lead-chats";

export function requestLeadChatRefresh(leadId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CRM_REFRESH_LEAD_CHATS, { detail: { leadId } }),
  );
}
