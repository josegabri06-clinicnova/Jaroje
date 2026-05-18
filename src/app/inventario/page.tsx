"use client";

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Package, Search, Plus, Minus, AlertTriangle, Edit2, Trash2, X } from 'lucide-react';

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
  const [formCategory, setFormCategory] = useState('blancos');
  const [formStock, setFormStock] = useState('0');
  const [formMinStock, setFormMinStock] = useState('10');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  const updateStock = async (id: string, currentStock: number, change: number) => {
    if (currentStock + change < 0) return;
    setUpdatingId(id);
    
    // Optimistic UI update
    setItems(prev => prev.map(item => item.id === id ? { ...item, stock: item.stock + change } : item));

    const { error } = await supabase
      .from('inventory')
      .update({ stock: currentStock + change, last_updated_by: 'Admin' })
      .eq('id', id);

    if (error) {
      console.error(error);
      alert("Error al actualizar inventario");
      fetchInventory(); // Revert
    }
    setUpdatingId(null);
  };

  const handleAddItem = async () => {
    if (!formName.trim()) return;
    setIsSubmitting(true);
    const newItem = {
      item_name: formName.trim(),
      category: formCategory,
      stock: parseInt(formStock) || 0,
      min_stock: parseInt(formMinStock) || 0,
      last_updated_by: 'Admin'
    };
    
    const { error } = await supabase.from('inventory').insert([newItem]);
    setIsSubmitting(false);
    
    if (error) {
      alert("Error al añadir artículo");
    } else {
      setIsAdding(false);
      fetchInventory();
    }
  };

  const handleUpdateItem = async () => {
    if (!editingItem || !formName.trim()) return;
    setIsSubmitting(true);
    const updated = {
      item_name: formName.trim(),
      category: formCategory,
      stock: parseInt(formStock) || 0,
      min_stock: parseInt(formMinStock) || 0,
      last_updated_by: 'Admin'
    };

    const { error } = await supabase.from('inventory').update(updated).eq('id', editingItem.id);
    setIsSubmitting(false);

    if (error) {
      alert("Error al actualizar artículo");
    } else {
      setEditingItem(null);
      fetchInventory();
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm("¿Seguro que quieres eliminar este artículo?")) return;
    setIsSubmitting(true);
    const { error } = await supabase.from('inventory').delete().eq('id', id);
    setIsSubmitting(false);
    
    if (error) {
      alert("Error al eliminar artículo");
    } else {
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

  const filteredItems = items.filter(item => item.item_name.toLowerCase().includes(searchTerm.toLowerCase()));

  // Categories for grouping
  const categories = [...new Set(filteredItems.map(i => i.category))];

  return (
    <div className="space-y-6 flex flex-col min-h-screen bg-[#fafafa] pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-[22px] font-semibold text-zinc-900 tracking-tight">Inventario</h2>
          <p className="text-[13px] font-medium text-zinc-500">Control de Almacén</p>
        </div>
        <div className="w-10 h-10 bg-zinc-900 text-white rounded-xl flex items-center justify-center shadow-lg">
          <Package size={20} strokeWidth={2.5} />
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

      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400" size={18} />
        <input 
          type="text" 
          placeholder="Buscar artículos..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-white border border-zinc-200/80 rounded-2xl py-3.5 pl-11 pr-4 text-[16px] font-medium text-zinc-900 focus:outline-none focus:border-zinc-400 focus:ring-4 focus:ring-zinc-900/5 transition-all shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
        />
      </div>

      {/* Botón Nuevo Artículo */}
      <button 
        onClick={() => {
          setFormName(''); setFormCategory('blancos'); setFormStock('0'); setFormMinStock('10'); setIsAdding(true);
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
          {categories.map(cat => (
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
                          onClick={() => updateStock(item.id, item.stock, -1)}
                          className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center text-zinc-700 active:scale-95 transition-transform disabled:opacity-50"
                        >
                          <Minus size={18} strokeWidth={2.5} />
                        </button>
                        <div className="w-8 text-center font-bold text-[15px] text-zinc-900">{item.stock}</div>
                        <button 
                          disabled={updatingId === item.id}
                          onClick={() => updateStock(item.id, item.stock, 1)}
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
                  <option value="blancos">Blancos</option>
                  <option value="amenidades">Amenidades</option>
                  <option value="limpieza">Limpieza</option>
                  <option value="bebidas">Bebidas</option>
                  <option value="otro">Otro</option>
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
    </div>
  );
}
