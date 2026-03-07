/*:
 * @plugindesc Single-slot cloud save sync for authenticated residents.
 * @author ThreeDungeons
 *
 * @help Requires sync-save Edge Function. Configure baasUrl (same as ResidencyAuth).
 * ResidencyAuth calls beforeContinue before opening the load scene.
 *
 * @param baasUrl
 * @desc Supabase project URL. Leave empty to use ResidencyAuth's baasUrl.
 * @default
 *
 * @param syncPath
 * @desc Edge Function path for save sync.
 * @default /functions/v1/sync-save
 *
 */

(function() {
    'use strict';

    var RESIDENT_SLOT = 1;

    var params = PluginManager.parameters('ResidencySaveSync');
    var authParams = PluginManager.parameters('ResidencyAuth') || {};
    var BAAS_URL = String(params['baasUrl'] || authParams['baasUrl'] || '').trim();
    var SYNC_PATH = String(params['syncPath'] || '/functions/v1/sync-save');

    function hasSession() {
        return !!sessionStorage.getItem('residency_token');
    }

    function getToken() {
        return sessionStorage.getItem('residency_token');
    }

    function beforeContinue(done) {
        if (!hasSession() || !BAAS_URL) {
            if (done) done();
            return;
        }
        var token = getToken();
        fetch(BAAS_URL + SYNC_PATH, {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + token }
        })
        .then(function(res) {
            if (res.status === 404) {
                if (done) done();
                return;
            }
            if (!res.ok) {
                if (done) done();
                return;
            }
            return res.json();
        })
        .then(function(data) {
            if (!data || !data.data || !data.savefileInfo) {
                if (done) done();
                return;
            }
            var key1 = StorageManager.webStorageKey(RESIDENT_SLOT);
            localStorage.setItem(key1, data.data);

            var globalInfo = [];
            try {
                var raw = StorageManager.load(0);
                if (raw) globalInfo = JSON.parse(raw) || [];
            } catch (e) {}
            globalInfo[RESIDENT_SLOT] = data.savefileInfo;
            StorageManager.save(0, JSON.stringify(globalInfo));

            if (done) done();
        })
        .catch(function() {
            if (done) done();
        });
    }

    var _orig_saveGameWithoutRescue = DataManager.saveGameWithoutRescue;
    DataManager.saveGameWithoutRescue = function(savefileId) {
        var effectiveId = (hasSession() && BAAS_URL) ? RESIDENT_SLOT : savefileId;
        var result = _orig_saveGameWithoutRescue.call(this, effectiveId);
        if (result && hasSession() && BAAS_URL) {
            var json = JsonEx.stringify(this.makeSaveContents());
            var compressed = LZString.compressToBase64(json);
            var info = this.makeSavefileInfo();
            var token = getToken();
            fetch(BAAS_URL + SYNC_PATH, {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    data: compressed,
                    savefileInfo: info,
                    timestamp: Date.now()
                })
            }).catch(function() {});
        }
        return result;
    };

    var _orig_maxSavefiles = DataManager.maxSavefiles;
    DataManager.maxSavefiles = function() {
        if (hasSession() && BAAS_URL) return 1;
        return _orig_maxSavefiles.call(this);
    };

    window.ResidencySaveSync = {
        beforeContinue: beforeContinue
    };
})();
