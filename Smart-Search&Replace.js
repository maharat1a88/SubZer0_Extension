/**
 * SubZer0 Smart Search & Replace
 * - "Visible": Only affects text nodes seen by the user.
 * - "Non-Visible": Checks attributes (titles, alt text, ARIA) and hidden metadata.
 */
function subZeroSmartReplace(searchTerm, replaceTerm) {
    const escapedSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedSearch, 'g');

    // 1. PROCESS VISIBLE TEXT (DOM Text Nodes)
    const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode: (node) => {
                // Skip script and style tags to prevent breaking the page
                const parent = node.parentElement.tagName;
                if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    let node;
    while (node = walker.nextNode()) {
        if (node.nodeValue.includes(searchTerm)) {
            node.nodeValue = node.nodeValue.replace(regex, replaceTerm);
        }
    }

    // 2. PROCESS NON-VISIBLE HTML (Attributes & Hidden elements)
    // We target common attributes where text might be hidden or used for tooltips
    const allElements = document.getElementsByTagName('*');
    for (let el of allElements) {
        // Check attributes like title, alt, placeholder, and aria-labels
        ['title', 'alt', 'placeholder', 'aria-label', 'value'].forEach(attr => {
            if (el.hasAttribute(attr) && el.getAttribute(attr).includes(searchTerm)) {
                el.setAttribute(attr, el.getAttribute(attr).replace(regex, replaceTerm));
            }
        });

        // Smart Check: If the element itself is hidden (display: none), 
        // we still process its innerHTML to ensure full HTML coverage.
        if (window.getComputedStyle(el).display === 'none' || el.type === 'hidden') {
            if (el.innerHTML.includes(searchTerm)) {
                el.innerHTML = el.innerHTML.replace(regex, replaceTerm);
            }
        }
    }

    console.log(`SubZer0: Replaced all instances of "${searchTerm}" with "${replaceTerm}" across visible and hidden layers.`);
}