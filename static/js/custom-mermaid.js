// Custom Mermaid initialization for Mermaid 11+
(function() {
    // Wait for mermaid library to load
    function initCustomMermaid() {
        if (typeof mermaid === 'undefined') {
            setTimeout(initCustomMermaid, 100);
            return;
        }

        const renderMermaid = () => {
            const isDark = document.body.getAttribute('theme') === 'dark';
            const mermaidTheme = isDark ? 'dark' : 'default';
            
            mermaid.initialize({
                startOnLoad: false,
                theme: mermaidTheme,
                securityLevel: 'loose'
            });

            // Use mermaid.run() for Mermaid 11+
            const elements = document.querySelectorAll('.mermaid');
            if (elements.length > 0) {
                mermaid.run({
                    nodes: elements,
                }).catch(error => {
                    console.error('Mermaid render error:', error);
                });
            }
        };

        // Initial render
        renderMermaid();

        // Re-render on theme switch
        const themeButtons = document.querySelectorAll('[data-theme-switch], .theme-switch');
        themeButtons.forEach(button => {
            button.addEventListener('click', () => {
                setTimeout(renderMermaid, 100);
            });
        });
    }

    // Start initialization when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCustomMermaid);
    } else {
        initCustomMermaid();
    }
})();

