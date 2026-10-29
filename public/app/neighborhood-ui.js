import {
  loadRegionIndex,
  resolveNeighborhood,
  readSavedNeighborhood,
  storeNeighborhood,
  STORAGE_KEY,
  AUTO_KEY,
} from "./neighborhood.js";
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function setupNeighborhood({ onChange }) {
  let current = readSavedNeighborhood(),
    index = null,
    busy = false,
    manualProvince = "",
    manualDistrict = "";
  const bar = document.getElementById("neighborhood-bar"),
    dialog = document.getElementById("neighborhood-dialog");
  function draw() {
    bar.innerHTML = `<div class="neighborhood-inner"><div><span class="neighborhood-label">우리 동네</span><strong>${esc(current?.label || "동네를 설정해 주세요")}</strong><small>${current ? (current.method === "location" ? "위치로 찾은 기본 동네 · 언제든 변경 가능" : "직접 선택한 기본 동네") : "위치를 허용하거나 직접 선택하면 동네 관련 정책이 기본으로 표시됩니다."}</small></div><div class="button-row"><button class="button compact" data-neighborhood="open">${current ? "동네 변경" : "동네 설정"}</button>${current ? '<button class="text-button small" data-neighborhood="clear">설정 해제</button>' : ""}</div></div>`;
  }
  function open() {
    dialog.innerHTML = `<div class="dialog-top"><h2 id="neighborhood-title">우리 동네 설정</h2><button class="icon-button" data-neighborhood="close" aria-label="동네 설정 닫기">×</button></div><p class="location-intro">위치를 허용하면 현재 동네를 찾아 기본 화면에 적용합니다. 직접 선택한 동네로 바꿀 수도 있어요.</p><section class="location-option"><h3>현재 위치로 동네 찾기</h3><p>‘위치 권한 요청’을 누르면 브라우저의 위치 허용 창이 열립니다. 정확한 좌표는 이 기기에서만 행정동 경계와 대조하며, 외부 업체나 앱 DB로 전송하지 않습니다. 저장하는 정보는 동네 이름·대표 위치입니다.</p><button class="button primary" data-neighborhood="locate" ${busy ? "disabled" : ""}>${busy ? "동네를 찾는 중…" : "위치 권한 요청"}</button><p class="small">브라우저·기기 설정에서 위치 권한을 언제든 취소할 수 있습니다.</p></section><div class="location-divider">또는 직접 선택</div><form id="neighborhood-form"><label for="neighborhood-province">시·도<select id="neighborhood-province" required><option value="">목록을 불러오는 중…</option></select></label><label for="neighborhood-district">시·군·구<select id="neighborhood-district" required disabled><option value="">시·도를 먼저 선택하세요</option></select></label><label for="neighborhood-town">읍·면·동<select id="neighborhood-town" required disabled><option value="">시·군·구를 먼저 선택하세요</option></select></label><button class="button" type="submit">선택한 동네를 기본으로 설정</button></form><p id="location-status" class="location-status" role="status" aria-live="polite"></p><p class="small">2026-10-01 행정동 경계를 사용합니다. 경계 부근·측정 오차로 다르게 나올 수 있으니 확인 후 변경하세요. <a href="/app/licenses/Neighborhood-DATA-LICENSE.txt" target="_blank" rel="noopener">경계 데이터 출처·이용 조건</a></p>`;
    if (!dialog.open) dialog.showModal();
    populate().catch((e) => setStatus(e.message));
  }
  function setStatus(message) {
    const target = document.getElementById("location-status");
    if (target) target.textContent = message;
  }
  async function populate() {
    index = await loadRegionIndex();
    manualProvince = current?.province || "";
    manualDistrict = current?.district || "";
    fillProvince();
  }
  function fillProvince() {
    const select = document.getElementById("neighborhood-province");
    if (!select) return;
    select.innerHTML =
      '<option value="">시·도 선택</option>' +
      [...new Set(index.regions.map((r) => r.province))]
        .map(
          (v) =>
            `<option ${manualProvince === v ? "selected" : ""}>${esc(v)}</option>`,
        )
        .join("");
    fillDistrict();
  }
  function fillDistrict() {
    const select = document.getElementById("neighborhood-district");
    const rows = index.regions.filter((r) => r.province === manualProvince);
    const values = [...new Set(rows.map((r) => r.district))];
    select.disabled = !manualProvince;
    select.innerHTML =
      '<option value="">시·군·구 선택</option>' +
      values
        .map(
          (v) =>
            `<option ${manualDistrict === v ? "selected" : ""}>${esc(v)}</option>`,
        )
        .join("");
    fillTown();
  }
  function fillTown() {
    const select = document.getElementById("neighborhood-town");
    const rows = index.regions.filter(
      (r) => r.province === manualProvince && r.district === manualDistrict,
    );
    select.disabled = !rows.length;
    select.innerHTML =
      '<option value="">읍·면·동 선택</option>' +
      rows
        .map(
          (r) =>
            `<option value="${esc(r.code)}" ${current?.code === r.code ? "selected" : ""}>${esc(r.town)}</option>`,
        )
        .join("");
  }
  function apply(region, method) {
    current = storeNeighborhood(region, method);
    draw();
    dialog.close();
    onChange(current);
  }
  async function locate({ silent = false } = {}) {
    if (busy) return;
    if (!navigator.geolocation) {
      if (!silent)
        setStatus(
          "이 브라우저는 위치 기능을 지원하지 않습니다. 동네를 직접 선택해 주세요.",
        );
      return;
    }
    busy = true;
    setStatus("기기의 위치를 확인하고 있습니다.");
    const button = dialog.querySelector("[data-neighborhood=locate]");
    if (button) {
      button.disabled = true;
      button.textContent = "동네를 찾는 중…";
    }
    try {
      const position = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          maximumAge: 60000,
          timeout: 15000,
        }),
      );
      const { latitude, longitude, accuracy } = position.coords;
      const region = await resolveNeighborhood(latitude, longitude);
      if (!region)
        throw Error(
          "현재 위치의 행정동을 확인하지 못했습니다. 해외·해상·경계 부근이거나 경계 데이터 밖일 수 있습니다. 직접 동네를 선택해 주세요.",
        );
      if (accuracy > 1500) {
        if (silent) return;
        setStatus(
          `측정 오차가 약 ${Math.round(accuracy / 1000)}km여서 ${region.label}로 확정하지 않았습니다. 아래에서 동네를 직접 확인해 주세요.`,
        );
        index = await loadRegionIndex();
        manualProvince = region.province;
        manualDistrict = region.district;
        fillProvince();
        document.getElementById("neighborhood-town").value = region.code;
        return;
      }
      apply(region, "location");
    } catch (e) {
      if (!silent)
        setStatus(
          e.code === 1
            ? "위치 권한이 허용되지 않았습니다. 직접 동네를 선택하거나 브라우저 설정에서 위치 권한을 바꿔 주세요."
            : e.code === 2
              ? "현재 위치를 확인할 수 없습니다. 기기의 위치 서비스를 확인하거나 직접 선택해 주세요."
              : e.code === 3
                ? "위치 확인 시간이 초과되었습니다. 다시 시도하거나 직접 선택해 주세요."
                : e.message || "동네를 찾지 못했습니다. 직접 선택해 주세요.",
        );
    } finally {
      busy = false;
      const b = dialog.querySelector("[data-neighborhood=locate]");
      if (b) {
        b.disabled = false;
        b.textContent = "위치 권한 요청";
      }
    }
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-neighborhood]");
    if (!b) return;
    e.preventDefault();
    const action = b.dataset.neighborhood;
    if (action === "open") open();
    if (action === "close") dialog.close();
    if (action === "locate") locate();
    if (action === "clear") {
      current = null;
      try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(AUTO_KEY);
      } catch {}
      draw();
      onChange(null);
    }
  });
  document.addEventListener("change", (e) => {
    if (!index) return;
    if (e.target.id === "neighborhood-province") {
      manualProvince = e.target.value;
      manualDistrict = "";
      fillDistrict();
    }
    if (e.target.id === "neighborhood-district") {
      manualDistrict = e.target.value;
      fillTown();
    }
  });
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "neighborhood-form") return;
    e.preventDefault();
    const region = index?.regions.find(
      (r) => r.code === document.getElementById("neighborhood-town").value,
    );
    if (region) apply(region, "manual");
    else setStatus("읍·면·동까지 선택해 주세요.");
  });
  draw();
  return {
    get current() {
      return current;
    },
    open,
    async start() {
      let auto = false;
      try {
        auto = localStorage.getItem(AUTO_KEY) === "true";
      } catch {}
      if (auto && navigator.permissions) {
        try {
          const permission = await navigator.permissions.query({
            name: "geolocation",
          });
          if (permission.state === "granted") await locate({ silent: true });
        } catch {}
      }
    },
  };
}
