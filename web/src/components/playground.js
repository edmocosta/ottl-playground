import {html, LitElement} from 'lit-element';
import '../wasm_exec.js';
import Split from 'split.js';
import {CONFIG_EXAMPLES, PAYLOAD_EXAMPLES} from './examples';
import './panels/config-panel';
import './panels/payload-panel';
import './panels/result-panel';
import {playgroundStyles} from './playground.styles';
import {nothing} from 'lit';
import {getJsonPayloadType} from './utils/json-payload';
import {base64ToUtf8, utf8ToBase64} from './utils/base64';

export class Playground extends LitElement {
  static properties = {
    title: {type: String},
    config: {type: String},
    payload: {type: String},
    evaluator: {type: String},
    hideEvaluators: {type: Boolean, attribute: 'hide-evaluators'},
    hideRunButton: {type: Boolean, attribute: 'hide-run-button'},
    disableShareLink: {type: Boolean, attribute: 'disable-share-link'},
    baseUrl: {type: String, attribute: 'base-url'},

    _loading: {state: true},
    _loadingWasm: {state: true},
    _evaluators: {state: true},
    _evaluatorsDocsURL: {state: true},
    _result: {state: true},
  };

  constructor() {
    super();
    this._initDefaultValues();
    this._addEventListeners();
  }

  _initDefaultValues() {
    this._loading = true;
    this.evaluator = 'transform_processor';
    this._hideEvaluators = false;
    this.hideRunButton = false;
    this.disableShareLink = false;
    this.title = 'OTTL Playground';
    this.payload = '{}';
    this.baseUrl = '';
  }

  static get styles() {
    return playgroundStyles;
  }

  get state() {
    return {
      config: this.config,
      payload: this.payload,
      evaluator: this.evaluator,
    };
  }

  set state(state) {
    this.evaluator = state.evaluator;
    this.payload = state.payload;
    this.config = state.config;
    this._setSelectedPayloadExample('');
  }

  firstUpdated() {
    this._spitComponents();
    this._loading = false;
    this._fetchWebAssembly();
    this._loadURLBase64DataHash();
  }

  willUpdate(changedProperties) {
    if (changedProperties.has('_evaluators')) {
      this._computeEvaluatorsDocsURL();
    }
    super.willUpdate(changedProperties);
  }

  _loadURLBase64DataHash() {
    if (this.disableShareLink === true) return;
    let hash = window.top.location.hash?.substring(1);
    if (hash) {
      try {
        let data = JSON.parse(base64ToUtf8(hash));
        if (data.payload) {
          try {
            data.payload = JSON.stringify(JSON.parse(data.payload), null, 2);
          } catch (e) {
            // Ignore
          }
        }
        this.state = {
          config: data?.config,
          evaluator: data?.evaluator,
          payload: data?.payload,
        };
      } catch (e) {
        // Ignore
      }
    }
  }

  _setSelectedPayloadExample(example) {
    let panel = this.shadowRoot.querySelector('#payload-code-panel');
    if (panel) {
      panel.selectedExample = example;
    }
  }

  _computeEvaluatorsDocsURL() {
    let docsURLs = {};
    this._evaluators?.forEach((it) => {
      docsURLs[it.id] = it.docsURL ?? null;
    });
    this._evaluatorsDocsURL = docsURLs;
  }

  render() {
    return html`
      ${this._loading
        ? html`
            <div id="loading">
              <!-- prettier-ignore -->
              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24"> <style>.spinner_qM83 { animation: spinner_8HQG 1.05s infinite } .spinner_oXPr { animation-delay: .1s } .spinner_ZTLf { animation-delay: .2s } @keyframes spinner_8HQG { 0%, 57.14% { animation-timing-function: cubic-bezier(0.33, .66, .66, 1); transform: translate(0) } 28.57% { animation-timing-function: cubic-bezier(0.33, 0, .66, .33); transform: translateY(-6px) } 100% { transform: translate(0) } }</style> <circle class="spinner_qM83" cx="4" cy="12" r="3"/> <circle class="spinner_qM83 spinner_oXPr" cx="12" cy="12" r="3"/> <circle class="spinner_qM83 spinner_ZTLf" cx="20" cy="12" r="3"/> </svg>
            </div>
          `
        : nothing}
      <div class="playground" id="playground">
        <slot name="playground-controls">
          <playground-controls
            id="playground-controls"
            ?hide-run-button="${this.hideRunButton}"
            ?hide-evaluators=${this._hideEvaluators}
            evaluator="${this.evaluator}"
            evaluators="${JSON.stringify(this._evaluators)}"
            ?loading="${this._loadingWasm}"
            @copy-link-clicked="${this._handleCopyLinkClick}"
            ?hide-copy-link-button="${this.disableShareLink}"
          >
            <slot
              name="playground-controls-app-title-text"
              slot="app-title-text"
            >
              ${this.title}
            </slot>
            <slot
              name="playground-controls-custom-components"
              slot="custom-components"
            >
            </slot>
          </playground-controls>
        </slot>
        <div class="split-horizontal">
          <div id="left-panel">
            <div class="split-vertical">
              <div id="config-code-panel-container">
                <playground-config-panel
                  id="config-code-panel"
                  examples="${JSON.stringify(CONFIG_EXAMPLES[this.evaluator])}"
                  config="${this.config}"
                  @config-changed="${(e) => (this.config = e.detail.value)}"
                  config-docs-url="${this._evaluatorsDocsURL?.[this.evaluator]}"
                  @config-example-changed="${this._handleConfigExampleChanged}"
                >
                  >
                </playground-config-panel>
              </div>
              <div id="payload-code-panel-container">
                <playground-payload-panel
                  id="payload-code-panel"
                  payload="${this.payload}"
                  @payload-changed="${(e) => (this.payload = e.detail.value)}"
                >
                </playground-payload-panel>
              </div>
            </div>
          </div>
          <div class="hidden-overflow" id="right-panel">
            <playground-result-panel
              id="result-panel"
              payload="${this.payload}"
              result="${JSON.stringify(this._result)}"
            >
            </playground-result-panel>
          </div>
        </div>
      </div>
    `;
  }

  _addEventListeners() {
    this.addEventListener('playground-run-requested', () => {
      this._runStatements();
    });
    this.addEventListener('evaluator-changed', (e) => {
      this.evaluator = e.detail.value;
    });
  }

  _fetchWebAssembly() {
    // eslint-disable-next-line no-undef
    const go = new Go();
    this._loadingWasm = true;

    let wasmUrl = this.baseUrl
      ? new URL('ottlplayground.wasm', this.baseUrl).href
      : 'ottlplayground.wasm';
    WebAssembly.instantiateStreaming(fetch(wasmUrl), go.importObject).then(
      (result) => {
        go.run(result.instance);
        // eslint-disable-next-line no-undef
        this._evaluators = statementsExecutors();
        this.updateComplete.then(() => {
          this._loadingWasm = false;
          const event = new CustomEvent('playground-wasm-ready', {
            bubbles: true,
            composed: true,
            cancelable: true,
          });
          window.dispatchEvent(event);
        });
      }
    );
  }

  _spitComponents() {
    Split(
      [
        this.shadowRoot.querySelector('#config-code-panel-container'),
        this.shadowRoot.querySelector('#payload-code-panel-container'),
      ],
      {
        direction: 'vertical',
      }
    );

    Split([
      this.shadowRoot.querySelector('#left-panel'),
      this.shadowRoot.querySelector('#right-panel'),
    ]);
  }

  _runStatements() {
    let state = this.state;
    let payloadType;
    try {
      payloadType = getJsonPayloadType(this.payload);
    } catch (e) {
      this.shadowRoot
        .querySelector('#result-panel')
        .showErrorMessage(`Invalid OTLP JSON payload: ${e}`);
      return;
    }

    // eslint-disable-next-line no-undef
    let result = executeStatements(
      state.config,
      payloadType,
      state.payload,
      state.evaluator
    );

    this.dispatchEvent(
      new CustomEvent('playground-run-result', {
        detail: {
          state: state,
          result: result,
          error:
            result && Object.prototype.hasOwnProperty.call(result, 'error'),
        },
        bubbles: true,
        composed: true,
        cancelable: true,
      })
    );

    this.payload = state.payload;
    this._result = result;
  }

  _handleConfigExampleChanged(event) {
    let example = event.detail.value;
    if (example) {
      this.payload = JSON.stringify(
        JSON.parse(PAYLOAD_EXAMPLES[example.otlp_type]),
        null,
        2
      );
      this._setSelectedPayloadExample(example.otlp_type);
    }
  }

  _handleCopyLinkClick() {
    let data = {...this.state};
    try {
      // Try to linearize the JSON to make it smaller
      data.payload = JSON.stringify(JSON.parse(data.payload));
    } catch (e) {
      // Ignore and use it as it's
    }

    let key = utf8ToBase64(JSON.stringify(data));
    this._copyToClipboard(this._buildUrlWithLink(key)).catch((e) => {
      console.error(e);
    });

    document.location.hash = key;
  }

  _buildUrlWithLink(value) {
    if (window.top.location.hash) {
      return window.top.location.href.replace(
        window.top.location.hash,
        '#' + value
      );
    } else {
      return window.top.location.href + '#' + value;
    }
  }

  async _copyToClipboard(textToCopy) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(textToCopy);
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = textToCopy;
      textArea.style.position = 'absolute';
      textArea.style.left = '-999999px';
      document.body.prepend(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (error) {
        console.error(error);
      } finally {
        textArea.remove();
      }
    }
  }
}

customElements.define('playground-stage', Playground);
