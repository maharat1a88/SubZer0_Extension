// 3. AUDIO & FUZZER SWEEP (The "Pings")
const audioTargets = document.querySelectorAll('audio, video, source, embed, object');
audioTargets.forEach(el => {
    // Check 'src' and 'data' attributes for sound file names
    ['src', 'data', 'href'].forEach(attr => {
        if (el.hasAttribute(attr) && el.getAttribute(attr).toLowerCase().includes(searchTerm.toLowerCase())) {
            const oldVal = el.getAttribute(attr);
            const newVal = oldVal.replace(regex, replaceTerm);
            el.setAttribute(attr, newVal);
            
            // Log it specifically since this is high-value for fuzzer research
            console.log(`%c [!] Sound/Fuzzer Intercepted: ${oldVal.split('/').pop()} `, 'color: #ff0055; font-weight: bold;');
            
            // Reload the element to "break" or "redirect" the sound
            if (el.load) el.load(); 
        }
    });
});