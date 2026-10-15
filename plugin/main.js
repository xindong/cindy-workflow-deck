// Classic entry is required by the host boot document. Modules stay same-origin.
void import('./runtime.js').catch(error => console.error('Workflow Deck failed to start:', error.code || error.name));
