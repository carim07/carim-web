// Mermaid 11+ initialization - overrides theme's broken implementation
(function() {
    // Intercept Theme initialization
    var originalTheme = window.Theme;
    if (originalTheme) {
        var checkInterval = setInterval(function() {
            if (window.Theme && window.Theme.prototype && window.Theme.prototype.initMermaid) {
                // Replace theme's initMermaid with our implementation
                window.Theme.prototype.initMermaid = function() {
                    var self = this;
                    var elements = document.querySelectorAll('.mermaid');
                    if (elements.length === 0 || typeof mermaid === 'undefined') return;
                    
                    var isDark = document.body.getAttribute('theme') === 'dark';
                    mermaid.initialize({
                        startOnLoad: false,
                        theme: isDark ? 'dark' : 'default'
                    });
                    
                    // Render each diagram
                    elements.forEach(function(element) {
                        var id = element.id;
                        var code = self.data && self.data[id] ? self.data[id] : null;
                        if (code) {
                            mermaid.render('svg-' + id, code).then(function(result) {
                                element.innerHTML = result.svg;
                            }).catch(function(err) {
                                console.error('Mermaid render error:', err);
                            });
                        }
                    });
                };
                clearInterval(checkInterval);
            }
        }, 10);
        
        // Stop checking after 2 seconds
        setTimeout(function() { clearInterval(checkInterval); }, 2000);
    }
})();

