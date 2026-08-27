/* ==========================================================================
   콕패스(KOKPASS) 개인 구매 위젯 (공용 모듈)
   ------------------------------------------------------------------------
   HHCOMPANY의 js/buy-widget.js 패턴을 그대로 참고해 콕패스 전용 Supabase
   프로젝트(okdahyvqhbqvfpvtpcip) + payment-confirm Edge Function에 맞춰
   새로 작성. 특정 업장에 종속되지 않도록 productId만 넘기면 어떤 업장 상세
   페이지에서도 그대로 재사용 가능(향후 타 여행사 SaaS 판매 시에도 이 구조
   유지 가능).

   사용법:
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="https://js.tosspayments.com/v1/payment"></script>
     <script src="kokpass-buy.js"></script>
     <div class="kpbw-mount" id="buy"></div>
     <script>KPBuyWidget.init({ mount: '#buy', productId: 'noljasup' });</script>

   동작:
   - 상품의 indiv_sale_enabled가 꺼져 있으면(현재 기본값) "온라인 판매 준비 중"
     안내만 표시하고 절대 결제 폼을 그리지 않음 — 재고(PIN) 확보 전에 실수로
     결제가 들어오는 걸 막기 위한 안전장치.
   - 로그인 안 돼있으면 "로그인하고 구매하기" 버튼 → login.html?redirect=현재페이지
   - 로그인 돼있으면 회원 정보 자동 입력 + 권종(티켓 종류) 선택 + 인원수 입력
     → payment-confirm Edge Function(create) → 토스페이먼츠 결제창 호출
     → confirm 승인 → 결제 완료 화면(바코드 발급 안내)
   ========================================================================== */
(function (global) {
  const SB_URL = 'https://okdahyvqhbqvfpvtpcip.supabase.co';
  const SB_KEY = 'sb_publishable_or8TBFpfxdJFC4MbC3PLrg_adM9L9h3';
  const FN_URL = `${SB_URL}/functions/v1/payment-confirm`;

  // ⚠️ [확인 필요] 콕패스 자체 토스페이먼츠 가맹점 계약이 아직 심사 중이라
  // 아직 발급된 클라이언트 키가 없음. 실제 키가 나오면 이 값과, 서버쪽
  // Edge Function Secrets의 TOSS_SECRET_KEY를 함께 교체해야 함(콕패스_백엔드_초기구축
  // 문서 참고). 그 전까지는 결제 버튼을 눌러도 안내 메시지만 뜨고 실제 결제창은 열리지 않음.
  const TOSS_CLIENT_KEY = '';

  let sb = null;
  function getClient() {
    if (!sb) sb = global.supabase.createClient(SB_URL, SB_KEY);
    return sb;
  }

  function money(n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; }
  function escapeAttr(s) { return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  async function fnFetch(path, body) {
    const res = await fetch(`${FN_URL}/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  let cssInjected = false;
  function injectCss() {
    if (cssInjected) return;
    cssInjected = true;
    const style = document.createElement('style');
    style.textContent = `
      .kpbw-box{font-family:inherit;background:#fff;border:1px solid rgba(18,51,47,.12);border-radius:16px;padding:22px 24px;max-width:480px}
      .kpbw-label{font-size:11.5px;font-weight:700;color:#5E7570;letter-spacing:.02em;margin-bottom:8px}
      .kpbw-price{font-size:24px;font-weight:900;color:#12332F;margin-bottom:14px}
      .kpbw-price small{font-size:12px;font-weight:600;color:#5E7570}
      .kpbw-btn{display:block;width:100%;padding:14px;border:none;border-radius:10px;background:#0E9E8F;color:#fff;font-size:15px;font-weight:800;cursor:pointer;font-family:inherit;text-align:center;text-decoration:none;box-sizing:border-box}
      .kpbw-btn:hover{background:#0B7E72}
      .kpbw-btn:disabled{opacity:.5;cursor:not-allowed}
      .kpbw-note{font-size:12px;color:#5E7570;line-height:1.7;margin-top:10px}
      .kpbw-field{margin-bottom:12px}
      .kpbw-field label{display:block;font-size:12px;font-weight:700;color:#12332F;margin-bottom:6px}
      .kpbw-field input,.kpbw-field select{width:100%;padding:11px 12px;border:1px solid rgba(18,51,47,.16);border-radius:8px;font-size:14.5px;font-family:inherit;background:#F2F7F5;box-sizing:border-box}
      .kpbw-field input:focus,.kpbw-field select:focus{outline:none;border-color:#0E9E8F;background:#fff}
      .kpbw-amount-row{display:flex;align-items:center;justify-content:space-between;background:#E6F3F1;border-radius:10px;padding:13px 15px;margin-bottom:14px}
      .kpbw-amount-row .l{font-size:12px;color:#5E7570;font-weight:600}
      .kpbw-amount-row .amt{font-size:19px;font-weight:800;color:#FF8A5B}
      .kpbw-methods{display:flex;flex-direction:column;gap:8px;margin-bottom:6px}
      .kpbw-method-btn{width:100%;padding:13px;border:1.5px solid rgba(18,51,47,.16);border-radius:10px;background:#fff;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer}
      .kpbw-method-btn:hover{border-color:#0E9E8F;color:#0E9E8F}
      .kpbw-method-btn:disabled{opacity:.5;cursor:not-allowed}
      .kpbw-msg{font-size:12px;color:#dc2626;margin-top:10px;line-height:1.6}
      .kpbw-soon-badge{display:inline-block;background:#E6F3F1;color:#0B7E72;font-size:11px;font-weight:800;padding:5px 11px;border-radius:999px;margin-bottom:14px}
      .kpbw-state strong{display:block;font-size:15px;margin-bottom:8px;color:#12332F}
      .kpbw-state{font-size:13.5px;color:#12332F;line-height:1.8}
      .kpbw-state .sub{font-size:12px;color:#5E7570;margin-top:10px}
      .kpbw-skel{color:#5E7570;font-size:13px;padding:6px 0}
    `;
    document.head.appendChild(style);
  }

  function init(opts) {
    injectCss();
    const mountEl = typeof opts.mount === 'string' ? document.querySelector(opts.mount) : opts.mount;
    if (!mountEl) { console.error('[KPBuyWidget] mount element not found:', opts.mount); return; }
    const state = { mountEl, productId: opts.productId, product: null, session: null, profile: null, selectedTicketIdx: 0 };

    mountEl.classList.add('kpbw-box');
    mountEl.innerHTML = `<div class="kpbw-skel">불러오는 중...</div>`;

    handleTossRedirectReturn(state).then((handled) => {
      if (handled) return;
      boot(state);
    });
  }

  async function fetchProduct(productId) {
    const res = await fetch(`${SB_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}&select=id,name,vname,tickets,indiv_price,indiv_sale_enabled,visible`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!res.ok) throw new Error('상품 조회 실패: ' + res.status);
    const rows = await res.json();
    return rows[0] || null;
  }

  async function boot(state) {
    const client = getClient();
    try {
      const sessRes = await client.auth.getSession();
      state.session = sessRes?.data?.session || null;
    } catch (e) { console.error('[KPBuyWidget] getSession() 실패:', e); }

    try {
      state.product = await fetchProduct(state.productId);
    } catch (e) {
      console.error('[KPBuyWidget] 상품 조회 실패 (productId=' + state.productId + '):', e);
      state.mountEl.innerHTML = `
        <div class="kpbw-label">개인 구매</div>
        <div class="kpbw-price">가격 정보를 불러오지 못했습니다</div>
        <div class="kpbw-note">잠시 후 다시 시도해주세요.</div>`;
      return;
    }

    if (!state.product) {
      state.mountEl.innerHTML = `
        <div class="kpbw-label">개인 구매</div>
        <div class="kpbw-price">판매 중인 상품이 아닙니다</div>`;
      return;
    }

    if (!state.product.indiv_sale_enabled) {
      state.mountEl.innerHTML = `
        <div class="kpbw-soon-badge">오픈 준비 중</div>
        <div class="kpbw-label">개인 구매</div>
        <div class="kpbw-price">현재 온라인 판매 준비 중입니다</div>
        <div class="kpbw-note">재고(입장권) 확보가 끝나는 대로 온라인 결제를 열 예정입니다. 급하신 경우 고객센터로 문의해주세요.</div>`;
      return;
    }

    if (state.session) {
      try {
        const { data: profile } = await client.from('profiles')
          .select('name, phone, email').eq('id', state.session.user.id).maybeSingle();
        state.profile = profile || null;
      } catch (e) { state.profile = null; }
    }

    render(state);
  }

  function ticketOptions(state) {
    const tickets = Array.isArray(state.product.tickets) && state.product.tickets.length
      ? state.product.tickets
      : [{ type: '입장권 (1인)', price: state.product.indiv_price }];
    return tickets;
  }

  function render(state) {
    const { mountEl } = state;
    const tickets = ticketOptions(state);
    const selected = tickets[state.selectedTicketIdx] || tickets[0];

    if (!state.session) {
      const redirectTo = encodeURIComponent(location.pathname + location.search + '#' + (mountEl.id || 'buy'));
      mountEl.innerHTML = `
        <div class="kpbw-label">${state.product.vname || state.product.name} · 개인 구매</div>
        <div class="kpbw-price">${money(selected.price)}<small> / 1인</small></div>
        <a class="kpbw-btn" href="login.html?redirect=${redirectTo}">로그인하고 구매하기 →</a>
        <div class="kpbw-note">회원가입/로그인 후 온라인으로 바로 결제하실 수 있어요. 처음이시면 로그인 화면에서 바로 가입도 가능합니다.</div>
      `;
      return;
    }

    const prefillName = state.profile?.name || '';
    const prefillPhone = state.profile?.phone || '';
    const prefillEmail = state.profile?.email || '';

    const ticketSelectHtml = tickets.length > 1
      ? `<div class="kpbw-field"><label>권종 선택</label>
          <select id="kpbw-ticket">
            ${tickets.map((t, i) => `<option value="${i}" ${i === state.selectedTicketIdx ? 'selected' : ''}>${escapeAttr(t.type)} — ${money(t.price)}${t.range ? ' (' + escapeAttr(t.range) + ')' : ''}</option>`).join('')}
          </select>
        </div>`
      : '';

    mountEl.innerHTML = `
      <div class="kpbw-label">${state.product.vname || state.product.name} · 개인 구매</div>
      <div class="kpbw-price" id="kpbw-unitprice">${money(selected.price)}<small> / 1인</small></div>
      ${ticketSelectHtml}
      <div class="kpbw-field"><label>구매자 이름</label><input type="text" id="kpbw-name" value="${escapeAttr(prefillName)}" placeholder="이름을 입력해주세요"></div>
      <div class="kpbw-field"><label>연락처</label><input type="tel" id="kpbw-phone" value="${escapeAttr(prefillPhone)}" placeholder="010-0000-0000"></div>
      <div class="kpbw-field"><label>이메일 (선택)</label><input type="email" id="kpbw-email" value="${escapeAttr(prefillEmail)}" placeholder="안내 발송용"></div>
      <div class="kpbw-field"><label>인원 수</label><input type="number" id="kpbw-qty" value="1" min="1" max="20"></div>
      <div class="kpbw-amount-row"><span class="l">결제 예정 금액</span><span class="amt" id="kpbw-amount">${money(selected.price)}</span></div>
      <button type="button" class="kpbw-btn" id="kpbw-submit">결제 진행하기</button>
      <div class="kpbw-msg" id="kpbw-msg"></div>
    `;

    const ticketSelect = mountEl.querySelector('#kpbw-ticket');
    const qtyInput = mountEl.querySelector('#kpbw-qty');
    const amountEl = mountEl.querySelector('#kpbw-amount');
    const unitPriceEl = mountEl.querySelector('#kpbw-unitprice');

    function recalc() {
      const idx = ticketSelect ? Number(ticketSelect.value) : 0;
      state.selectedTicketIdx = idx;
      const t = tickets[idx];
      const q = Math.max(1, parseInt(qtyInput.value, 10) || 1);
      unitPriceEl.innerHTML = `${money(t.price)}<small> / 1인</small>`;
      amountEl.textContent = money(t.price * q);
    }
    if (ticketSelect) ticketSelect.onchange = recalc;
    qtyInput.oninput = recalc;
    mountEl.querySelector('#kpbw-submit').onclick = () => submitTicket(state, tickets);
  }

  async function submitTicket(state, tickets) {
    const { mountEl } = state;
    const name = mountEl.querySelector('#kpbw-name').value.trim();
    const phone = mountEl.querySelector('#kpbw-phone').value.trim();
    const email = mountEl.querySelector('#kpbw-email').value.trim();
    const qty = Math.max(1, parseInt(mountEl.querySelector('#kpbw-qty').value, 10) || 1);
    const ticket = tickets[state.selectedTicketIdx] || tickets[0];
    const msg = mountEl.querySelector('#kpbw-msg');
    const btn = mountEl.querySelector('#kpbw-submit');

    if (!name) { msg.textContent = '이름을 입력해주세요.'; return; }
    if (!phone) { msg.textContent = '연락처를 입력해주세요.'; return; }
    msg.textContent = '';

    btn.disabled = true; btn.textContent = '신청 접수 중...';
    const created = await fnFetch('create', {
      productId: state.productId, quantity: qty, buyerName: name, buyerPhone: phone,
      buyerEmail: email || undefined, ticketType: ticket.type, unitPrice: ticket.price,
    });

    if (!created.ok) {
      btn.disabled = false; btn.textContent = '결제 진행하기';
      msg.textContent = created.data?.message || '신청 처리에 실패했습니다.';
      return;
    }

    const orderId = created.data.data.orderId;
    const amount = created.data.data.amount;
    renderPaymentStep(state, orderId, amount, name, email);
  }

  function renderPaymentStep(state, orderId, amount, buyerName, buyerEmail) {
    const { mountEl } = state;

    if (!TOSS_CLIENT_KEY) {
      mountEl.innerHTML = `
        <div class="kpbw-state">
          <strong>결제 시스템 준비 중입니다</strong>
          콕패스 자체 결제(토스페이먼츠) 가맹점 계약이 아직 심사 중이라, 실제 카드 결제는 아직 열려있지 않습니다.
          <div class="sub">접수번호 ${escapeAttr(orderId)} · 결제 예정 금액 ${money(amount)}는 계약 완료 후 다시 안내드릴게요.</div>
        </div>`;
      return;
    }

    mountEl.innerHTML = `
      <div class="kpbw-amount-row"><span class="l">결제 금액</span><span class="amt">${money(amount)}</span></div>
      <div class="kpbw-methods" id="kpbw-method-grid">
        <button type="button" class="kpbw-method-btn" data-method="카드">💳 카드로 결제</button>
        <button type="button" class="kpbw-method-btn" data-method="계좌이체">🏦 계좌이체로 결제</button>
        <button type="button" class="kpbw-method-btn" data-method="토스페이">🅣 토스페이로 결제</button>
      </div>
      <div class="kpbw-msg" id="kpbw-msg"></div>
    `;

    let tossPayments;
    try {
      tossPayments = global.TossPayments(TOSS_CLIENT_KEY);
    } catch (e) {
      console.error('토스페이먼츠 SDK 초기화 실패:', e);
      mountEl.querySelector('#kpbw-msg').textContent = '결제 모듈을 불러오지 못했습니다: ' + (e?.message || e);
      return;
    }

    mountEl.querySelectorAll('.kpbw-method-btn').forEach(btn => {
      btn.onclick = async () => {
        const msg = mountEl.querySelector('#kpbw-msg');
        msg.textContent = '';
        mountEl.querySelectorAll('.kpbw-method-btn').forEach(b => b.disabled = true);
        try {
          await tossPayments.requestPayment(btn.dataset.method, {
            amount, orderId, orderName: state.product.name,
            customerName: buyerName, customerEmail: buyerEmail || undefined,
            successUrl: location.origin + location.pathname + location.search,
            failUrl: location.origin + location.pathname + location.search,
          });
        } catch (e) {
          console.error('토스 결제 요청 실패:', e);
          mountEl.querySelectorAll('.kpbw-method-btn').forEach(b => b.disabled = false);
          if (e?.code === 'USER_CANCEL') { msg.textContent = '결제가 취소되었습니다.'; return; }
          msg.textContent = '결제창을 여는 데 실패했습니다: ' + (e?.message || e || '알 수 없는 오류');
        }
      };
    });
  }

  function showConfirmingState(state) {
    state.mountEl.classList.add('kpbw-box');
    state.mountEl.innerHTML = `<div class="kpbw-state"><strong>결제 확인 중입니다...</strong>잠시만 기다려주세요.</div>`;
  }
  function showConfirmedState(state, pins) {
    state.mountEl.innerHTML = `
      <div class="kpbw-state">
        <strong>결제가 완료됐습니다!</strong>
        발급된 바코드: <b>${escapeAttr((pins && pins[0]) || '-')}</b>
        <div class="sub">입력하신 연락처로 입장 안내가 발송됩니다. (마이페이지 기능은 준비 중입니다)</div>
      </div>`;
  }
  function showConfirmFailedState(state, message) {
    state.mountEl.innerHTML = `
      <div class="kpbw-state">
        <strong>결제 확인에 실패했습니다</strong>
        ${escapeAttr(message || '결제 승인 중 문제가 발생했습니다.')}
        <div class="sub">문의: 고객센터 (연락처 준비 중)</div>
      </div>`;
  }

  async function handleTossRedirectReturn(state) {
    const params = new URLSearchParams(location.search);
    const paymentKey = params.get('paymentKey');
    const orderId = params.get('orderId');
    const amount = params.get('amount');
    const failCode = params.get('code');

    if (paymentKey && orderId && amount) {
      injectCss();
      state.mountEl.classList.add('kpbw-box');
      showConfirmingState(state);
      const confirmed = await fnFetch('confirm', { orderId, paymentKey, amount: Number(amount) });
      if (confirmed.ok) {
        showConfirmedState(state, confirmed.data?.data?.pins);
        history.replaceState(null, '', location.pathname);
        return true;
      }
      showConfirmFailedState(state, confirmed.data?.message);
      history.replaceState(null, '', location.pathname);
      return true;
    } else if (failCode) {
      injectCss();
      state.mountEl.classList.add('kpbw-box');
      const orderIdFromFail = params.get('orderId') || '';
      state.mountEl.innerHTML = `
        <div class="kpbw-state">
          <strong>결제가 취소됐어요</strong>
          ${escapeAttr(params.get('message') || '결제가 완료되지 않았습니다.')}
          <div class="sub">${orderIdFromFail ? '접수번호 ' + escapeAttr(orderIdFromFail) + ' · ' : ''}다시 시도하시려면 아래에서 다시 구매를 진행해주세요.</div>
        </div>`;
      history.replaceState(null, '', location.pathname);
      return true;
    }
    return false;
  }

  global.KPBuyWidget = { init };
})(window);
