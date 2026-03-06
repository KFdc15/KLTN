<script setup lang="ts">
const devices = [
	{ name: 'Camera', status: 'Online' },
	{ name: 'Smart Plug', status: 'Offline' },
]
</script>

<template>
	<div class="relative">
		<div
			class="rounded-2xl border border-white/40 bg-white/50 p-4 shadow-lg shadow-slate-900/5 backdrop-blur-md"
		>
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<div class="h-8 w-8 rounded-xl bg-linear-to-br from-sky-600/20 to-indigo-600/20" />
					<div>
						<div class="text-sm font-semibold text-slate-900">Dashboard</div>
						<div class="text-xs text-slate-600">Fleet overview</div>
					</div>
				</div>
				<div class="hidden sm:block text-xs text-slate-600">Live</div>
			</div>

			<div class="mt-4 grid grid-cols-2 gap-3">
				<div class="rounded-2xl border border-slate-200/60 bg-white/60 p-3">
					<div class="text-xs text-slate-600">Online</div>
					<div class="mt-1 text-xl font-semibold tabular-nums text-slate-900">2</div>
				</div>
				<div class="rounded-2xl border border-slate-200/60 bg-white/60 p-3">
					<div class="text-xs text-slate-600">Offline</div>
					<div class="mt-1 text-xl font-semibold tabular-nums text-slate-900">1</div>
				</div>
			</div>

			<div class="mt-4 rounded-2xl border border-slate-200/60 bg-white/60 p-3">
				<div class="flex items-center justify-between">
					<div class="text-sm font-semibold text-slate-900">Devices</div>
					<div class="text-xs text-slate-600">Status</div>
				</div>
				<ul class="mt-3 space-y-2">
					<li
						v-for="device in devices"
						:key="device.name"
						class="flex items-center justify-between rounded-xl border border-slate-200/60 bg-white/70 px-3 py-2"
					>
						<div class="flex items-center gap-2">
							<div
								:class="[
									'h-2.5 w-2.5 rounded-full',
									device.status === 'Online' ? 'bg-emerald-500/80' : 'bg-rose-500/80',
								]"
							/>
							<span class="text-sm text-slate-800">{{ device.name }}</span>
						</div>
						<span class="text-xs text-slate-600">{{ device.status }}</span>
					</li>
				</ul>
			</div>
		</div>

		<div
			class="absolute -bottom-8 -left-10 hidden sm:block h-28 w-28 rounded-full bg-linear-to-br from-sky-500/15 to-indigo-500/15"
		/>
	</div>
</template>
