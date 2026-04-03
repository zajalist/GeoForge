// Wrapper to expose the Emscripten module as a factory function
(async function() {
  // Load the compiled WASM module
  const script = document.createElement('script');
  script.src = '/sim.js';
  script.async = false;

  // Create a promise that resolves when sim.js loads
  const simLoadPromise = new Promise((resolve, reject) => {
    script.onload = () => {
      // After sim.js loads, the Module object should be available
      if (typeof Module !== 'undefined') {
        resolve();
      } else {
        reject(new Error('Module not defined after loading sim.js'));
      }
    };
    script.onerror = () => {
      reject(new Error('Failed to load sim.js'));
    };
  });

  // Add script to document
  document.head.appendChild(script);

  try {
    // Wait for sim.js to load
    await simLoadPromise;

    // Create the factory function that page.jsx expects
    window.createTectonicModule = function(options) {
      return Module(options || {});
    };
  } catch (error) {
    console.error('Failed to initialize WASM module:', error);
  }
})();
