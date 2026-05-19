/**
 * SubZer0 Smart Search & Replace Logic
 * Targeted for: Full HTML visibility (Visible + Hidden Attributes)
 */
const subZeroReplace = (searchTerm, replaceTerm) => {
    if (!searchTerm) return;
    
    const escapedSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedSearch, 'g');
    let visibleCount = 0;
    let hiddenCount = 0;

    // 1. Surgical Text Node Replacement (Visible)
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                const parent = node.parentElement?.tagName;
                if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA'].includes(parent)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    let node;
    while (node = walker.nextNode()) {
        if (node.nodeValue.includes(searchTerm)) {
            node.nodeValue = node.nodeValue.replace(regex, replaceTerm);
            visibleCount++;
        }
    }

    // 2. Attribute & Metadata Sweep (Non-Visible)
    const targets = ['title', 'alt', 'placeholder', 'aria-label', 'value', 'data-tooltip'];
    document.querySelectorAll('*').forEach(el => {
        targets.forEach(attr => {
            if (el.hasAttribute(attr) && el.getAttribute(attr).includes(searchTerm)) {
                el.setAttribute(attr, el.getAttribute(attr).replace(regex, replaceTerm));
                hiddenCount++;
            }
        });
        
        // Handle hidden inputs and display:none elements specifically
        if (el.tagName === 'INPUT' && el.type === 'hidden' && el.value.includes(searchTerm)) {
            el.value = el.value.replace(regex, replaceTerm);
            hiddenCount++;
        }
    });

    console.log(`%c SubZer0 Sweep Complete `, 'background: #00f2ff; color: #000; font-weight: bold; border-radius: 4px;');
    console.log(`> Visible Nodes: ${visibleCount}\n> Hidden/Attributes: ${hiddenCount}`);
};

// Listener for the Popup Message
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "SEARCH_REPLACE") {
        subZeroReplace(request.data.s, request.data.r);
    }
});