"use strict";

const KobunCloud = (() => {
  async function loadConfig(path) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      return response.ok ? response.json() : {};
    } catch (_) {
      return {};
    }
  }

  function hasUsableConfig(value) {
    const url = String(value?.supabaseUrl || "");
    const key = String(value?.supabaseAnonKey || "");
    return Boolean(url && key) && !/example\.supabase\.co|YOUR_PROJECT_ID/i.test(url) && !/^dummy$|^YOUR_/i.test(key);
  }

  function sharedParams() {
    const params = new URLSearchParams(location.search);
    return {
      studentId: params.get("s") || params.get("student") || "",
      token: params.get("t") || params.get("token") || "",
    };
  }

  function create({ appId, getPatch, applyLoaded, onStatus = () => {} }) {
    const session = { enabled: false, student: null, studentId: "", token: "" };
    let config = {};
    let timer = null;
    let queue = Promise.resolve();
    const pending = new Map();

    async function rpc(name, body) {
      const response = await fetch(`${config.supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: {
          apikey: config.supabaseAnonKey,
          Authorization: `Bearer ${config.supabaseAnonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
      return response.status === 204 ? null : response.json();
    }

    async function init() {
      const shared = sharedParams();
      if (!shared.studentId && !shared.token) return session;
      session.studentId = shared.studentId;
      session.token = shared.token;
      config = await loadConfig("static/config.json");
      if (!hasUsableConfig(config)) {
        onStatus("生徒別URLですが、クラウド設定が未完了です。", "ng");
        return session;
      }
      try {
        const authRows = await rpc("app_auth_student", {
          p_student_id: shared.studentId,
          p_access_token: shared.token,
        });
        const student = Array.isArray(authRows) ? authRows[0] : authRows;
        if (!student?.id) throw new Error("生徒別URLを確認できませんでした。");
        session.student = { id: String(student.id), name: String(student.display_name || student.id) };
        const loadedRows = await rpc("app_load_progress", {
          p_app: appId,
          p_student_id: shared.studentId,
          p_access_token: shared.token,
        });
        const loaded = Array.isArray(loadedRows) ? loadedRows[0] : loadedRows;
        applyLoaded(loaded?.progress || loaded || {});
        session.enabled = true;
        onStatus(`${session.student.name} さんとして学習中（クラウド同期）`, "ok");
      } catch (error) {
        console.error(error);
        onStatus(error.message || "クラウド同期に失敗しました。", "ng");
      }
      return session;
    }

    function queueSave(patchOverride = null) {
      if (!session.enabled) return;
      const patch = patchOverride || getPatch();
      if (!patch?.datasetId || !patch.progress) return;
      pending.set(String(patch.datasetId), patch);
      onStatus(`${session.student.name} さんの進捗を保存中…`, "syncing");
      clearTimeout(timer);
      timer = setTimeout(() => {
        const patches = [...pending.values()];
        pending.clear();
        queue = queue.then(async () => {
          for (const item of patches) {
            await rpc("app_save_progress_dataset", {
              p_app: appId,
              p_student_id: session.studentId,
              p_access_token: session.token,
              p_dataset_id: item.datasetId,
              p_dataset_progress: item.progress,
              p_meta: item.meta || {},
            });
          }
        }).then(() => onStatus(`${session.student.name} さんの進捗を保存済み`, "ok"))
          .catch((error) => {
            patches.forEach((item) => pending.set(String(item.datasetId), item));
            console.error(error);
            onStatus("クラウド保存に失敗しました。通信状況を確認してください。", "ng");
          });
      }, 600);
    }

    return { init, queueSave, isEnabled: () => session.enabled };
  }

  return { create };
})();
