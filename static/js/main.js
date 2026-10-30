import { render } from 'preact';
import { html } from './html.js';
import { App } from './app.js';

render(html`<${App} />`, document.getElementById('app'));
