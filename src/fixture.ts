export const CHECKOUT_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
  </head>
  <body>
    <main class="checkout-shell">
      <section class="checkout-copy" aria-labelledby="checkout-title">
        <p class="eyebrow">Rillstone Goods</p>
        <h1 id="checkout-title">Complete your order</h1>
        <p class="muted">Secure checkout for your studio essentials.</p>

        <form>
          <div class="field">
            <span>Email address</span>
            <input id="email" name="email" type="email" autocomplete="email">
          </div>

          <h2 class="payment-heading">Payment</h2>
          <label class="field">
            <span>Card number</span>
            <input name="card" inputmode="numeric" autocomplete="cc-number">
          </label>

          <button class="continue" type="submit" tabindex="2">Continue to payment</button>
        </form>
      </section>

      <aside class="order-summary" aria-labelledby="summary-title">
        <div class="summary-heading">
          <h2 id="summary-title">Order summary</h2>
          <button class="icon-button" type="button"><span aria-hidden="true">×</span></button>
        </div>
        <img class="product-image" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=">
        <div class="product-copy">
          <strong>Canvas desk organizer</strong>
          <span>Natural · One size</span>
        </div>
        <dl>
          <div><dt>Subtotal</dt><dd>$48.00</dd></div>
          <div><dt>Shipping</dt><dd>Free</dd></div>
          <div class="total"><dt>Total</dt><dd>$48.00</dd></div>
        </dl>
      </aside>
    </main>
  </body>
</html>`

export const CHECKOUT_CSS = `
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; background: #f4f1ea; color: #17211b; font: 15px/1.5 system-ui, sans-serif; }
.checkout-shell { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(260px, .8fr); gap: 36px; max-width: 920px; margin: 0 auto; padding: 48px 28px; }
.checkout-copy, .order-summary { background: #fff; border: 1px solid #d7dbd8; border-radius: 14px; padding: 28px; }
.eyebrow { margin: 0; color: #315b44; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
h1 { margin: 6px 0 4px; font-size: 30px; line-height: 1.15; }
h2 { margin: 0; }
.payment-heading { margin-top: 12px; font-size: 17px; }
.muted { margin: 0 0 24px; color: #a7ada9; }
form, .field { display: grid; gap: 8px; }
form { gap: 18px; }
.field span { font-weight: 650; }
input { width: 100%; border: 1px solid #aeb7b1; border-radius: 8px; padding: 11px 12px; font: inherit; }
button { font: inherit; }
.continue { border: 0; border-radius: 8px; padding: 12px 16px; background: #1e5a3d; color: white; font-weight: 700; }
.summary-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.icon-button { display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid #c8ceca; border-radius: 50%; background: white; color: #28342d; font-size: 24px; }
.product-image { display: block; width: 100%; height: 148px; margin: 22px 0 14px; border-radius: 10px; background: linear-gradient(135deg, #aa9a7b, #e7dfd0); image-rendering: pixelated; }
.product-copy { display: grid; gap: 2px; }
.product-copy span { color: #59645d; }
dl { margin: 22px 0 0; }
dl div { display: flex; justify-content: space-between; padding: 7px 0; }
dd { margin: 0; }
.total { margin-top: 8px; border-top: 1px solid #d7dbd8; font-weight: 750; }
@media (max-width: 680px) { .checkout-shell { grid-template-columns: 1fr; padding: 20px; } }
`
