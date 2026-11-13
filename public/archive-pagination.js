(function (root) {
  'use strict';

  function page(items, limit) {
    const rows = Array.isArray(items) ? items : [];
    const requested = Number(limit);
    const size = Number.isFinite(requested) ? Math.max(1, Math.floor(requested)) : 1;
    const visible = rows.slice(0, size);
    return { visible, total: rows.length, remaining: Math.max(0, rows.length - visible.length) };
  }

  root.AiryArchivePagination = Object.freeze({ page });
})(window);
