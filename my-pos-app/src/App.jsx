import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar/Navbar';
import SearchBar from './components/SearchBar/SearchBar';
import ProductArea from './components/ProductCard/ProductCard';
import CartArea from './components/Cart/Cart';
import { supabase } from '../utils/supabaseClient';
import './App.css';

function App() {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cartItems, setCartItems] = useState([]);

  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
  const fetchProducts = async () => {
    try {
      // Bắt đầu gọi API từ Supabase
      setIsLoading(true);
      const { data, error } = await supabase
        .from('products')
        .select('*');

      if (error) {
        throw error;
      }

      setProducts(data);
      
    } catch (error) {
      console.error("Lỗi khi tải dữ liệu:", error.message);
    } finally {
      setIsLoading(false);
    }
  };
  fetchProducts();
}, []);

  const handleAddToCart = (product) => {
    const existingItem = cartItems.find((item) => item.id === product.id);
    if (existingItem) {
      const newCart = cartItems.map((item) =>
        item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
      );
      setCartItems(newCart);
    } else {
      const newItem = { ...product, unit: 'Ly', quantity: 1 };
      setCartItems([...cartItems, newItem]); 
    }
  };

  return (
    <div className="app-container">
      <Navbar />
      <SearchBar setSearchTerm={setSearchTerm} />
      
      <div className="main-content">
        <ProductArea 
          products={products} 
          isLoading={isLoading} 
          onAddToCart={handleAddToCart} 
          searchTerm={searchTerm} 
        />
        <CartArea 
          cartItems={cartItems} 
          setCartItems={setCartItems} 
        />
      </div>
    </div>
  );
}

// Fix loi 404

export default App;

