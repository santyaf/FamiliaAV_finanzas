// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { Activos, AssetModal, ValuationModal, SellAssetModal } from './Activos';

afterEach(() => cleanup());

const today = new Date().toISOString().slice(0, 10);
const data = {
  currency: 'COP',
  members: [{ id: 'm1', name: 'Ana' }],
  accounts: [{ id: 'a1', name: 'Ahorros', type: 'individual', ownerIds: ['m1'] }],
  creditsWithPayments: [{ credit: { id: 'k1', name: 'Hipoteca', currency: 'COP', principal: 100000000, status: 'activo' }, payments: [] }],
  assets: [
    { id: 'as1', ownerMemberId: null, name: 'Apartamento', kind: 'propiedad', acquiredOn: '2020-01-01', acquisitionCost: 200000000, creditId: 'k1', status: 'activo', valuations: [{ id: 'v1', date: '2026-06-01', value: 250000000, note: 'Avalúo' }] },
    { id: 'as2', ownerMemberId: 'm1', name: 'CDT', kind: 'inversion', acquiredOn: '2026-01-01', acquisitionCost: 10000000, status: 'activo', valuations: [] },
    { id: 'as3', ownerMemberId: null, name: 'Moto vieja', kind: 'vehiculo', acquiredOn: '2015-01-01', acquisitionCost: 5000000, status: 'vendido', soldOn: '2026-05-01', soldAmount: 3000000, valuations: [] },
  ],
};

describe('Activos (prueba de humo)', () => {
  it('muestra los activos, la deuda asociada y los vendidos aparte', () => {
    render(<Activos data={data} actions={{}} setModal={() => {}} />);
    expect(screen.getByText('Apartamento')).toBeTruthy();
    expect(screen.getByText('CDT')).toBeTruthy();
    expect(screen.getByText(/Deuda: Hipoteca/)).toBeTruthy();
    expect(screen.getByText('Vendidos o cobrados')).toBeTruthy();
    expect(screen.getByText('Moto vieja')).toBeTruthy();
  });
  it('sin activos invita a agregar el primero', () => {
    render(<Activos data={{ ...data, assets: [] }} actions={{}} setModal={() => {}} />);
    expect(screen.getByText('Aún no registras activos')).toBeTruthy();
  });
  it('los botones abren los modales correctos', () => {
    const setModal = vi.fn();
    render(<Activos data={data} actions={{}} setModal={setModal} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Nuevo' }));
    expect(setModal).toHaveBeenCalledWith({ type: 'asset' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Actualizar valor' })[0]);
    expect(setModal.mock.calls.at(-1)[0].type).toBe('assetValuation');
    fireEvent.click(screen.getAllByRole('button', { name: 'Vender' })[0]);
    expect(setModal.mock.calls.at(-1)[0].type).toBe('sellAsset');
  });
});

describe('AssetModal', () => {
  it('exige nombre y costo o valor, y crea el activo con lo capturado', async () => {
    const createAsset = vi.fn().mockResolvedValue();
    render(<AssetModal data={data} actions={{ userId: 'm1', createAsset }} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Crear activo' }));
    expect(screen.getByText('Ponle un nombre.')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Apartamento Laureles/), { target: { value: 'Casa Envigado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear activo' }));
    expect(screen.getByText('Indica el costo o el valor actual.')).toBeTruthy();
    fireEvent.change(screen.getAllByPlaceholderText('0')[0], { target: { value: '300000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear activo' }));
    await waitFor(() => expect(createAsset).toHaveBeenCalledTimes(1));
    expect(createAsset.mock.calls[0][0]).toMatchObject({ name: 'Casa Envigado', kind: 'propiedad', acquisitionCost: 300000000, ownerMemberId: null, payFromAccountId: null });
  });
  it('un activo privado queda a nombre de quien lo crea', async () => {
    const createAsset = vi.fn().mockResolvedValue();
    render(<AssetModal data={data} actions={{ userId: 'm1', createAsset }} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/Apartamento Laureles/), { target: { value: 'Bitcoin' } });
    fireEvent.change(screen.getByDisplayValue('Propiedad (inmueble)'), { target: { value: 'inversion' } });
    fireEvent.change(screen.getByDisplayValue(/Del hogar/), { target: { value: 'yo' } });
    fireEvent.change(screen.getAllByPlaceholderText('0')[0], { target: { value: '1000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear activo' }));
    await waitFor(() => expect(createAsset).toHaveBeenCalled());
    expect(createAsset.mock.calls[0][0]).toMatchObject({ kind: 'inversion', ownerMemberId: 'm1' });
  });
});

describe('ValuationModal / SellAssetModal', () => {
  it('agrega una valoración con fecha, valor y nota', async () => {
    const addAssetValuation = vi.fn().mockResolvedValue();
    render(<ValuationModal data={data} actions={{ addAssetValuation }} payload={{ asset: data.assets[0] }} onClose={() => {}} />);
    expect(screen.getByText('Avalúo')).toBeTruthy();
    fireEvent.change(screen.getAllByPlaceholderText('0')[0], { target: { value: '260000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar valoración' }));
    await waitFor(() => expect(addAssetValuation).toHaveBeenCalledTimes(1));
    expect(addAssetValuation.mock.calls[0][0]).toBe('as1');
    expect(addAssetValuation.mock.calls[0][1]).toMatchObject({ date: today, value: 260000000 });
  });
  it('vender registra la fecha, el precio y la cuenta donde entró el dinero', async () => {
    const sellAsset = vi.fn().mockResolvedValue();
    render(<SellAssetModal data={data} actions={{ userId: 'm1', sellAsset }} payload={{ asset: data.assets[1] }} onClose={() => {}} />);
    fireEvent.change(screen.getByDisplayValue('No registrar el ingreso en una cuenta'), { target: { value: 'a1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar venta' }));
    await waitFor(() => expect(sellAsset).toHaveBeenCalledTimes(1));
    expect(sellAsset.mock.calls[0][1]).toMatchObject({ date: today, accountId: 'a1', memberId: 'm1' });
  });
});
