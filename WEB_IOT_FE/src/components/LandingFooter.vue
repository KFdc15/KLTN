<script setup lang="ts">
const year = new Date().getFullYear()
</script>

<template>
	<footer class="border-t border-white/30 bg-white/40 backdrop-blur-md">
		<div class="mx-auto max-w-6xl px-4 py-10 sm:px-6">
			<div class="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<div class="text-sm font-semibold text-slate-900">University IoT Graduation Project</div>
					<div class="mt-1 text-sm text-slate-600">Built by <span class="font-medium text-slate-800">NGUYEN CONG HIEU</span></div>
				</div>
				<div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
					<span>© {{ year }} IoT Platform</span>
				</div>
			</div>
		</div>
	</footer>
</template>
