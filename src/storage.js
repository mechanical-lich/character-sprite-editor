const STORAGE_KEY = 'sprite_editor_custom_library';

export function loadCustomLibrary() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

export function saveCustomLibrary(lib) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lib));
}

export function addToCustomLibrary(category, name, data, w, h) {
    const lib = loadCustomLibrary();
    if (!lib[category]) lib[category] = [];
    lib[category].push({ name, data: Array.from(data), w, h });
    saveCustomLibrary(lib);
    return lib;
}

export function removeFromCustomLibrary(category, index) {
    const lib = loadCustomLibrary();
    if (lib[category]) {
        lib[category].splice(index, 1);
        if (lib[category].length === 0) delete lib[category];
    }
    saveCustomLibrary(lib);
    return lib;
}
