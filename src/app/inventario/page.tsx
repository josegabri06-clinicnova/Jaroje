"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Package, Search, Plus, Minus, AlertTriangle, Edit2, Trash2, X, History, Settings, Download, ArrowUp, ArrowDown } from 'lucide-react';
import { getActiveEmployee } from '@/lib/auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

type InventoryItem = {
  id: string;
  item_name: string;
  category: string;
  stock: number;
  min_stock: number;
};

export default function InventarioPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // CRUD States
  const [isAdding, setIsAdding] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  
  // Form States
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formStock, setFormStock] = useState('0');
  const [formMinStock, setFormMinStock] = useState('10');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New SaaS Custom states
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [categoriesOrder, setCategoriesOrder] = useState<string[]>([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Modal Category creation/rename state
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renamingNewName, setRenamingNewName] = useState('');

  const fetchInventory = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .order('category', { ascending: true })
      .order('item_name', { ascending: true });
    
    if (error) console.error("Error fetching inventory:", error);
    else setItems(data || []);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  // Initialize and load custom categories order
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('jaroje_inventory_categories');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCategoriesOrder(parsed);
            return;
          }
        } catch (e) {
          console.warn("Error parsing saved categories:", e);
        }
      }
      const defaults = ['Blancos', 'Amenidades', 'Limpieza', 'Bebidas', 'Alimentos', 'Otros'];
      localStorage.setItem('jaroje_inventory_categories', JSON.stringify(defaults));
      setCategoriesOrder(defaults);
    }
  }, []);

  // Auto-sync missing database categories into custom categories
  useEffect(() => {
    if (items.length > 0 && categoriesOrder.length > 0) {
      const dbCategories = [...new Set(items.map(item => item.category))];
      const missing = dbCategories.filter(cat => cat && !categoriesOrder.includes(cat));
      if (missing.length > 0) {
        const updated = [...categoriesOrder, ...missing];
        setCategoriesOrder(updated);
        localStorage.setItem('jaroje_inventory_categories', JSON.stringify(updated));
      }
    }
  }, [items, categoriesOrder]);

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await fetch('/api/employee-logs?module=inventario');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setLogs(json.data || []);
        } else {
          console.error("Error fetching logs:", json.error);
        }
      } else {
        console.error("Failed to fetch logs API:", res.statusText);
      }
    } catch (err) {
      console.error("Error fetching inventory audit logs:", err);
    }
    setIsLoadingLogs(false);
  };

  useEffect(() => {
    if (showLogsModal) {
      fetchLogs();
    }
  }, [showLogsModal]);

  // Category helper actions
  const moveCategory = (catName: string, direction: 'up' | 'down') => {
    const idx = categoriesOrder.indexOf(catName);
    if (idx === -1) return;
    const nextIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (nextIdx < 0 || nextIdx >= categoriesOrder.length) return;
    
    const updated = [...categoriesOrder];
    updated[idx] = updated[nextIdx];
    updated[nextIdx] = catName;
    
    setCategoriesOrder(updated);
    localStorage.setItem('jaroje_inventory_categories', JSON.stringify(updated));
  };

  const handleAddCategory = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    if (categoriesOrder.includes(clean)) {
      alert("La categoría ya existe.");
      return;
    }
    const updated = [...categoriesOrder, clean];
    setCategoriesOrder(updated);
    localStorage.setItem('jaroje_inventory_categories', JSON.stringify(updated));
  };

  const handleRenameCategory = async (oldName: string, newName: string) => {
    const cleanNew = newName.trim();
    if (!cleanNew || cleanNew === oldName) return;
    if (categoriesOrder.includes(cleanNew)) {
      alert("La categoría destino ya existe.");
      return;
    }
    
    setIsSubmitting(true);
    
    const { error } = await supabase
      .from('inventory')
      .update({ category: cleanNew })
      .eq('category', oldName);
      
    if (error) {
      console.error("Error renaming category in Supabase:", error);
      alert("Error al renombrar la categoría en el servidor de base de datos.");
    } else {
      const updated = categoriesOrder.map(cat => cat === oldName ? cleanNew : cat);
      setCategoriesOrder(updated);
      localStorage.setItem('jaroje_inventory_categories', JSON.stringify(updated));
      
      try {
        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: '999',
            employee_name: 'Administrador',
            department: 'Administración',
            module: 'inventario',
            action: 'renombrar_categoria',
            details: `Renombró la categoría de inventario: "${oldName}" ➔ "${cleanNew}"`
          })
        });
      } catch (e) {
        console.error(e);
      }
      
      fetchInventory();
      alert("Categoría renombrada con éxito.");
    }
    setIsSubmitting(false);
  };

  const handleAdjustStock = async (item: InventoryItem, direction: 'add' | 'remove') => {
    const actionLabel = direction === 'add' ? 'sumar al' : 'restar del';
    const quantityStr = prompt(`¿Qué cantidad deseas ${actionLabel} stock de "${item.item_name}"?`, "1");
    if (quantityStr === null) return;
    
    const quantity = parseInt(quantityStr.trim(), 10);
    if (isNaN(quantity) || quantity <= 0) {
      alert("Por favor, ingresa una cantidad entera válida mayor a 0.");
      return;
    }
    
    const change = direction === 'add' ? quantity : -quantity;
    await updateStock(item.id, item.stock, change);
  };

  const exportInventoryToCSV = () => {
    if (filteredItems.length === 0) return alert("No hay datos para exportar.");
    window.location.href = `/api/inventory/export?search=${encodeURIComponent(searchTerm)}&onlyLowStock=${onlyLowStock}`;
  };

  const updateStock = async (id: string, currentStock: number, change: number) => {
    if (currentStock + change < 0) return;
    setUpdatingId(id);
    
    // Optimistic UI update
    setItems(prev => prev.map(item => item.id === id ? { ...item, stock: item.stock + change } : item));

    let empName = 'Administrador';
    let empNum = '999';
    let empDept = 'Administración';
    
    const activeEmp = ['recepcion', 'limpieza', 'mantenimiento']
      .map(dept => getActiveEmployee(dept as any))
      .find(emp => emp !== null);
      
    if (activeEmp) {
      empName = activeEmp.full_name;
      empNum = activeEmp.employee_num;
      empDept = activeEmp.department;
    }

    const { error } = await supabase
      .from('inventory')
      .update({ stock: currentStock + change, last_updated_by: empName })
      .eq('id', id);

    if (error) {
      console.error(error);
      alert("Error al actualizar inventario");
      fetchInventory(); // Revert
    } else {
      // Registrar log de auditoría real
      const targetItem = items.find(i => i.id === id);
      if (targetItem) {
        try {
          await fetch('/api/employee-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employee_num: empNum,
              employee_name: empName,
              department: empDept,
              module: 'inventario',
              action: 'ajuste_stock',
              details: `Ajustó stock de ${targetItem.item_name} (${targetItem.category}): ${currentStock} ➔ ${currentStock + change} (Cambio: ${change > 0 ? '+' : ''}${change})`
            })
          });
        } catch (logErr) {
          console.error("Error al registrar log de stock en Supabase:", logErr);
        }
      }
    }
    setUpdatingId(null);
  };

  const handleAddItem = async () => {
    if (!formName.trim()) return;
    setIsSubmitting(true);
    
    let empName = 'Administrador';
    let empNum = '999';
    let empDept = 'Administración';
    
    const activeEmp = ['recepcion', 'limpieza', 'mantenimiento']
      .map(dept => getActiveEmployee(dept as any))
      .find(emp => emp !== null);
      
    if (activeEmp) {
      empName = activeEmp.full_name;
      empNum = activeEmp.employee_num;
      empDept = activeEmp.department;
    }

    const newItem = {
      item_name: formName.trim(),
      category: formCategory,
      stock: parseInt(formStock) || 0,
      min_stock: parseInt(formMinStock) || 0,
      last_updated_by: empName
    };
    
    const { error } = await supabase.from('inventory').insert([newItem]);
    setIsSubmitting(false);
    
    if (error) {
      alert("Error al añadir artículo");
    } else {
      // Registrar log de auditoría real
      try {
        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: empNum,
            employee_name: empName,
            department: empDept,
            module: 'inventario',
            action: 'nuevo_articulo',
            details: `Creó nuevo artículo de almacén: ${newItem.item_name} | Stock inicial: ${newItem.stock} (Min: ${newItem.min_stock})`
          })
        });
      } catch (logErr) {
        console.error("Error al registrar log de nuevo artículo en Supabase:", logErr);
      }
      setIsAdding(false);
      fetchInventory();
    }
  };

  const handleUpdateItem = async () => {
    if (!editingItem || !formName.trim()) return;
    setIsSubmitting(true);
    
    let empName = 'Administrador';
    let empNum = '999';
    let empDept = 'Administración';
    
    const activeEmp = ['recepcion', 'limpieza', 'mantenimiento']
      .map(dept => getActiveEmployee(dept as any))
      .find(emp => emp !== null);
      
    if (activeEmp) {
      empName = activeEmp.full_name;
      empNum = activeEmp.employee_num;
      empDept = activeEmp.department;
    }

    const updated = {
      item_name: formName.trim(),
      category: formCategory,
      stock: parseInt(formStock) || 0,
      min_stock: parseInt(formMinStock) || 0,
      last_updated_by: empName
    };

    const { error } = await supabase.from('inventory').update(updated).eq('id', editingItem.id);
    setIsSubmitting(false);

    if (error) {
      alert("Error al actualizar artículo");
    } else {
      // Registrar log de auditoría real
      try {
        await fetch('/api/employee-logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employee_num: empNum,
            employee_name: empName,
            department: empDept,
            module: 'inventario',
            action: 'actualizacion_articulo',
            details: `Modificó parámetros de ${editingItem.item_name} ➔ ${updated.item_name} | Stock: ${updated.stock} | Categoría: ${updated.category}`
          })
        });
      } catch (logErr) {
        console.error("Error al registrar log de edición en Supabase:", logErr);
      }
      setEditingItem(null);
      fetchInventory();
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm("¿Seguro que quieres eliminar este artículo?")) return;
    setIsSubmitting(true);
    
    let empName = 'Administrador';
    let empNum = '999';
    let empDept = 'Administración';
    
    const activeEmp = ['recepcion', 'limpieza', 'mantenimiento']
      .map(dept => getActiveEmployee(dept as any))
      .find(emp => emp !== null);
      
    if (activeEmp) {
      empName = activeEmp.full_name;
      empNum = activeEmp.employee_num;
      empDept = activeEmp.department;
    }

    const targetItem = items.find(i => i.id === id);

    const { error } = await supabase.from('inventory').delete().eq('id', id);
    setIsSubmitting(false);
    
    if (error) {
      alert("Error al eliminar artículo");
    } else {
      // Registrar log de auditoría real
      if (targetItem) {
        try {
          await fetch('/api/employee-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              employee_num: empNum,
              employee_name: empName,
              department: empDept,
              module: 'inventario',
              action: 'eliminar_articulo',
              details: `Eliminó artículo de almacén permanentemente: ${targetItem.item_name} (${targetItem.category})`
            })
          });
        } catch (logErr) {
          console.error("Error al registrar log de borrado en Supabase:", logErr);
        }
      }
      setEditingItem(null);
      fetchInventory();
    }
  };

  const openEditModal = (item: InventoryItem) => {
    setEditingItem(item);
    setFormName(item.item_name);
    setFormCategory(item.category);
    setFormStock(item.stock.toString());
    setFormMinStock(item.min_stock.toString());
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          item.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLowStock = onlyLowStock ? item.stock <= item.min_stock : true;
    return matchesSearch && matchesLowStock;
  });

  // Categories for grouping
  const categories = [...new Set(filteredItems.map(i => i.category))];

  // Sort categories by custom categoriesOrder
  const sortedCategories = categories.sort((a, b) => {
    const indexA = categoriesOrder.indexOf(a);
    const indexB = categoriesOrder.indexOf(b);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  return (
    <div className="space-y-6 flex flex-col min-h-screen bg-[#fafafa] pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-[22px] font-black text-zinc-900 tracking-tight">INVENTARIO</h2>
          <p className="text-[11px] font-black text-zinc-400 uppercase tracking-widest mt-0.5">Control de Almacén</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={exportInventoryToCSV}
            className="h-10 px-3 bg-white border border-zinc-200 text-zinc-700 rounded-full flex items-center gap-1 shadow-sm active:scale-95 hover:bg-zinc-50 transition-all text-xs font-bold shrink-0 cursor-pointer"
            title="Descargar Reporte en Excel"
          >
            <Download size={13} className="text-zinc-550" />
            <span className="hidden sm:inline">Reporte</span>
          </button>
          <button
            onClick={() => setShowLogsModal(true)}
            className="h-10 px-3 bg-white border border-zinc-200 text-zinc-700 rounded-full flex items-center gap-1 shadow-sm active:scale-95 hover:bg-zinc-50 transition-all text-xs font-bold shrink-0 cursor-pointer"
            title="Ver Historial de Movimientos"
          >
            <History size={13} className="text-zinc-550" />
            <span className="hidden sm:inline">Historial</span>
          </button>
          <button
            onClick={() => setShowCategoryModal(true)}
            className="h-10 px-3 bg-white border border-zinc-200 text-zinc-700 rounded-full flex items-center gap-1 shadow-sm active:scale-95 hover:bg-zinc-50 transition-all text-xs font-bold shrink-0 cursor-pointer"
            title="Gestionar Categorías"
          >
            <Settings size={13} className="text-zinc-550" />
            <span className="hidden sm:inline">Categorías</span>
          </button>
        </div>
      </div>

      {/* Alertas de Stock */}
      {items.some(i => i.stock <= i.min_stock) && (
        <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl shadow-sm flex items-start gap-3">
          <AlertTriangle size={18} className="text-rose-600 mt-0.5 shrink-0" strokeWidth={2.5} />
          <div>
            <p className="text-[13px] font-bold text-rose-900 leading-tight">Stock bajo detectado</p>
            <p className="text-[12px] text-rose-700 font-medium mt-0.5">Algunos artículos necesitan reabastecimiento urgente.</p>
          </div>
        </div>
      )}

      {/* Buscador y Switch de Stock Bajo */}
      <div className="flex gap-2 w-full">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar artículos por nombre o categoría..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-zinc-200/80 rounded-2xl py-3.5 pl-11 pr-4 text-[16px] font-medium text-zinc-900 focus:outline-none focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
          />
        </div>
        <button
          type="button"
          onClick={() => setOnlyLowStock(!onlyLowStock)}
          className={`px-4 rounded-2xl border font-black text-[11px] uppercase tracking-wider transition-all flex items-center gap-1.5 active:scale-95 shadow-sm shrink-0 select-none cursor-pointer ${
            onlyLowStock
              ? 'bg-rose-50 border-rose-200 text-rose-600 ring-2 ring-rose-500/10'
              : 'bg-white border-zinc-200 text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
          }`}
        >
          <AlertTriangle size={14} strokeWidth={2.5} />
          <span>⚠️ Stock Bajo</span>
        </button>
      </div>

      {/* Botón Nuevo Artículo */}
      <button 
        onClick={() => {
          setFormName(''); 
          setFormCategory(categoriesOrder[0] || 'Blancos'); 
          setFormStock('0'); 
          setFormMinStock('10'); 
          setIsAdding(true);
        }}
        className="w-full bg-zinc-900 text-white rounded-2xl py-3.5 text-[14px] font-bold shadow-md hover:bg-black transition-colors active:scale-[0.98] flex items-center justify-center gap-2"
      >
        <Plus size={18} strokeWidth={2.5} />
        Nuevo Artículo
      </button>

      {/* Lista por categorías */}
      {isLoading ? (
        <div className="p-12 text-center"><div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-900 rounded-full animate-spin mx-auto" /></div>
      ) : categories.length === 0 ? (
        <div className="text-center p-8 text-zinc-400 text-[13px] font-medium bg-white rounded-2xl border border-zinc-200 border-dashed">No se encontraron artículos.</div>
      ) : (
        <div className="space-y-6">
          {sortedCategories.map(cat => (
            <div key={cat}>
              <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3 px-1">{cat}</h3>
              <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.03)] flex flex-col divide-y divide-zinc-100 overflow-hidden">
                {filteredItems.filter(i => i.category === cat).map(item => {
                  const isLowStock = item.stock <= item.min_stock;
                  return (
                    <div key={item.id} className="p-4 flex items-center justify-between hover:bg-zinc-50 transition-colors">
                      <div className="flex-1 cursor-pointer" onClick={() => openEditModal(item)}>
                        <p className="text-[14px] font-bold text-zinc-900 flex items-center gap-2">
                          {item.item_name}
                          <Edit2 size={12} className="text-zinc-300" />
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[12px] font-semibold ${isLowStock ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {item.stock} en stock
                          </span>
                          <span className="text-[11px] font-medium text-zinc-400">Min: {item.min_stock}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
                        <button 
                          disabled={item.stock === 0 || updatingId === item.id}
                          onClick={() => handleAdjustStock(item, 'remove')}
                          className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center text-zinc-700 active:scale-95 transition-transform disabled:opacity-50"
                        >
                          <Minus size={18} strokeWidth={2.5} />
                        </button>
                        <div className="w-8 text-center font-bold text-[15px] text-zinc-900">{item.stock}</div>
                        <button 
                          disabled={updatingId === item.id}
                          onClick={() => handleAdjustStock(item, 'add')}
                          className="w-10 h-10 rounded-lg bg-zinc-900 shadow-sm flex items-center justify-center text-white active:scale-95 transition-transform disabled:opacity-50"
                        >
                          <Plus size={18} strokeWidth={2.5} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal CRUD (Add/Edit) */}
      {(isAdding || editingItem) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl animate-in zoom-in-95 fade-in-20 duration-300 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-zinc-900">
                {isAdding ? 'Nuevo Artículo' : 'Editar Artículo'}
              </h3>
              <button onClick={() => { setIsAdding(false); setEditingItem(null); }} className="p-2 bg-zinc-100 rounded-full text-zinc-500">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5 block">Nombre del Artículo</label>
                <input 
                  type="text" 
                  value={formName} onChange={e => setFormName(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-base font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/20"
                />
              </div>

              <div>
                <label className="text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5 block">Categoría</label>
                <select 
                  value={formCategory} onChange={e => setFormCategory(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-base font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/20"
                >
                  {categoriesOrder.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5 block">Stock Actual</label>
                  <input 
                    type="number" 
                    value={formStock} onChange={e => setFormStock(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-base font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/20"
                  />
                </div>
                <div>
                  <label className="text-[12px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5 block">Mínimo Alerta</label>
                  <input 
                    type="number" 
                    value={formMinStock} onChange={e => setFormMinStock(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-base font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900/20"
                  />
                </div>
              </div>

              <div className="pt-3 flex gap-2">
                {editingItem && (
                  <button 
                    disabled={isSubmitting}
                    onClick={() => handleDeleteItem(editingItem.id)}
                    className="w-12 h-[52px] bg-rose-50 border border-rose-200 text-rose-600 rounded-xl flex items-center justify-center shrink-0 hover:bg-rose-100 transition-colors"
                  >
                    <Trash2 size={20} strokeWidth={2.5} />
                  </button>
                )}
                <button 
                  disabled={isSubmitting || !formName.trim()}
                  onClick={isAdding ? handleAddItem : handleUpdateItem}
                  className="flex-1 bg-zinc-900 text-white rounded-xl h-[52px] font-bold text-[15px] shadow-lg hover:bg-black transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Guardando...' : 'Guardar Artículo'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Gestión de Categorías */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/60 backdrop-blur-md p-4 transition-all duration-300">
          <div className="bg-white w-full max-w-md rounded-[32px] p-6 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.2)] border border-zinc-150 animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-5 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center text-zinc-900 border border-zinc-200">
                  <Settings size={18} strokeWidth={2.5} className="text-zinc-850" />
                </div>
                <div>
                  <h3 className="text-[17px] font-black text-zinc-900 tracking-tight leading-tight">
                    Gestionar Categorías
                  </h3>
                  <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mt-0.5">Catálogo y Ordenamiento</span>
                </div>
              </div>
              <button 
                onClick={() => setShowCategoryModal(false)}
                className="p-2 bg-zinc-100 hover:bg-zinc-200 rounded-full text-zinc-500 transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Añadir nueva categoría */}
            <div className="mb-4 shrink-0">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nueva categoría..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-zinc-855 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 placeholder:text-zinc-400"
                />
                <button
                  onClick={() => {
                    handleAddCategory(newCategoryName);
                    setNewCategoryName('');
                  }}
                  className="h-10 px-4 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold flex items-center gap-1 active:scale-95 transition-transform cursor-pointer"
                >
                  <Plus size={14} strokeWidth={3} />
                  <span>Añadir</span>
                </button>
              </div>
            </div>

            {/* List of categories for reordering and renaming */}
            <div className="flex-1 overflow-y-auto pr-1 space-y-2 mb-4">
              {categoriesOrder.map((cat, index) => (
                <div key={cat} className="flex justify-between items-center bg-zinc-50 hover:bg-zinc-100/50 p-3 rounded-2xl border border-zinc-200/55 transition-all duration-200">
                  <div className="flex-1 truncate mr-2">
                    {renamingCategory === cat ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={renamingNewName}
                          onChange={(e) => setRenamingNewName(e.target.value)}
                          className="w-full bg-white border border-zinc-350 rounded-lg px-2 py-1 text-xs font-bold text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                        />
                        <button
                          onClick={() => {
                            handleRenameCategory(cat, renamingNewName);
                            setRenamingCategory(null);
                          }}
                          className="px-2 py-1 bg-emerald-500 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                        >
                          Ok
                        </button>
                        <button
                          onClick={() => setRenamingCategory(null)}
                          className="px-2 py-1 bg-zinc-200 text-zinc-700 rounded-lg text-[10px] font-bold cursor-pointer"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <span className="font-extrabold text-zinc-900 text-[13px] block truncate leading-tight select-none">
                        {cat}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 select-none">
                    <button
                      disabled={index === 0}
                      onClick={() => moveCategory(cat, 'up')}
                      className="p-1.5 bg-zinc-100 hover:bg-zinc-200 disabled:opacity-40 rounded-lg text-zinc-650 cursor-pointer active:scale-90 transition-transform"
                      title="Mover arriba"
                    >
                      <ArrowUp size={12} strokeWidth={2.5} />
                    </button>
                    <button
                      disabled={index === categoriesOrder.length - 1}
                      onClick={() => moveCategory(cat, 'down')}
                      className="p-1.5 bg-zinc-100 hover:bg-zinc-200 disabled:opacity-40 rounded-lg text-zinc-650 cursor-pointer active:scale-90 transition-transform"
                      title="Mover abajo"
                    >
                      <ArrowDown size={12} strokeWidth={2.5} />
                    </button>
                    {renamingCategory !== cat && (
                      <button
                        onClick={() => {
                          setRenamingCategory(cat);
                          setRenamingNewName(cat);
                        }}
                        className="p-1.5 hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 rounded-lg transition-all cursor-pointer"
                        title="Renombrar categoría"
                      >
                        <Edit2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 shrink-0">
              <button 
                onClick={() => setShowCategoryModal(false)}
                className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl transition-all duration-300 text-[13px] active:scale-[0.96] cursor-pointer text-center"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Historial de Auditoría */}
      {showLogsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/60 backdrop-blur-md p-4 transition-all duration-300">
          <div className="bg-white w-full max-w-lg rounded-[32px] p-6 shadow-[0_24px_50px_-12px_rgba(0,0,0,0.2)] border border-zinc-150 animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 bg-zinc-100 rounded-xl flex items-center justify-center text-zinc-900 border border-zinc-200">
                  <History size={18} strokeWidth={2.5} className="text-zinc-850" />
                </div>
                <div>
                  <h3 className="text-[17px] font-black text-zinc-900 tracking-tight leading-tight">
                    Historial de Movimientos
                  </h3>
                  <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest block mt-0.5">Auditoría en Tiempo Real</span>
                </div>
              </div>
              <button 
                onClick={() => setShowLogsModal(false)}
                className="p-2 bg-zinc-100 hover:bg-zinc-200 rounded-full text-zinc-500 transition-all cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* List of audit logs */}
            <div className="flex-1 overflow-y-auto pr-1 mb-4 space-y-4">
              {isLoadingLogs ? (
                <div className="py-12 text-center"><div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-900 rounded-full animate-spin mx-auto" /></div>
              ) : logs.length === 0 ? (
                <div className="text-center p-8 text-zinc-400 text-[12px] font-medium bg-zinc-50 rounded-2xl border border-zinc-100 border-dashed">No se encontraron movimientos registrados en la auditoría.</div>
              ) : (
                <div className="relative border-l border-zinc-200 ml-3 pl-5 space-y-5 py-2">
                  {logs.map((log) => {
                    const formattedDate = log.created_at ? new Date(log.created_at).toLocaleString('es-MX', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) : '';
                    
                    return (
                      <div key={log.id} className="relative group">
                        {/* Bullet point on line */}
                        <div className="absolute -left-[26px] top-1 w-3.5 h-3.5 rounded-full bg-zinc-900 border-2 border-white ring-2 ring-zinc-200 group-hover:bg-emerald-500 group-hover:ring-emerald-100 transition-all" />
                        <div>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <span className="text-[12px] font-black text-zinc-900 leading-tight">
                              {log.employee_name} ({log.department})
                            </span>
                            <span className="text-[9.5px] font-bold text-zinc-400 leading-none">
                              {formattedDate}
                            </span>
                          </div>
                          <p className="text-[11.5px] font-bold text-zinc-500 mt-1 leading-snug">
                            {log.details}
                          </p>
                          <span className="inline-block text-[8px] font-black uppercase tracking-wider bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded-md text-zinc-500 mt-1.5">
                            {log.action}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="pt-2 shrink-0">
              <button 
                onClick={() => setShowLogsModal(false)}
                className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-xl transition-all duration-300 text-[13px] active:scale-[0.96] cursor-pointer text-center"
              >
                Cerrar Historial
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
