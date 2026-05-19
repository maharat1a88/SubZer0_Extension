/**
 * SubZer0 Pro - Consolidated Build
 * May 15, 2026
 */

const searchTerm = "TargetBrand"; // Replace this with what you're hunting
const replaceTerm = "SubZer0_REDACTED";
const regex = new RegExp(searchTerm, 'gi');

function subZeroFullSweep() {
    console.log("%c [SubZer0] Initializing Full System Sweep... ", "background: #111; color: #00f2ff; font-weight: bold;");

    // 1. VISIBLE TEXT SWEEP
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while (node = walker.nextNode()) {
        if (node.nodeValue.match(regex)) {
            node.nodeValue = node.nodeValue.replace(regex, replaceTerm);
        }
    }

    // 2. METADATA & ATTRIBUTE SWEEP (Tooltips, Titles, etc.)
    const attrTargets = document.querySelectorAll('[title], [alt], [placeholder], [aria-label]');
    attrTargets.forEach(el => {
        ['title', 'alt', 'placeholder', 'aria-label'].forEach(attr => {
            if (el.hasAttribute(attr) && el.getAttribute(attr).match(regex)) {
                el.setAttribute(attr, el.getAttribute(attr).replace(regex, replaceTerm));
            }
        });
    });

    // 3. AUDIO & FUZZER SWEEP (The "Pings")
    const audioTargets = document.querySelectorAll('audio, video, source, embed, object');
    audioTargets.forEach(el => {
        ['src', 'data', 'href'].forEach(attr => {
            if (el.hasAttribute(attr) && el.getAttribute(attr).toLowerCase().includes(searchTerm.toLowerCase())) {
                const oldVal = el.getAttribute(attr);
                el.setAttribute(attr, oldVal.replace(regex, replaceTerm));
                console.log(`%c [!] Sound/Fuzzer Intercepted: ${oldVal.split('/').pop()} `, 'color: #ff0055; font-weight: bold;');
                if (el.load) el.load(); 
            }
        });
    });

    console.log("%c [SubZer0] Sweep Complete. System Secure. ", "color: #00ff41; font-weight: bold;");
}

// Run on load
subZeroFullSweep();

// Watch for dynamic content (AJAX/Single Page Apps)
const observer = new MutationObserver(() => {
    subZeroFullSweep();
});
observer.observe(document.body, { childList: true, subtree: true });