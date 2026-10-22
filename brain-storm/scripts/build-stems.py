#!/usr/bin/env python3
"""Reproducibly build the pinned, single-thread Demucs SIMD worker backend.

Requires emcc/em++ and CMake on PATH. Environment overrides:
SAMPLIFY_DEMUCS_SOURCE, SAMPLIFY_EIGEN_SOURCE, SAMPLIFY_STEM_MODEL_FILE.
The model is split below Cloudflare Pages' per-asset size limit.
"""
from pathlib import Path
import hashlib,json,os,shutil,subprocess

ROOT=Path(__file__).resolve().parents[1]
TOOLS=Path('/workspace/.samplify-tools')
DEMUCS=Path(os.environ.get('SAMPLIFY_DEMUCS_SOURCE',str(TOOLS/'demucs-source')))
EIGEN=Path(os.environ.get('SAMPLIFY_EIGEN_SOURCE','/workspace/mellowdy-chop/build/_deps/samplify_eigen-src'))
MODEL=Path(os.environ.get('SAMPLIFY_STEM_MODEL_FILE',str(TOOLS/'models/ggml-model-htdemucs-4s-f16.bin')))
PIN='72b17c42d308982ddb5069bc3bf48b81a5aac4cb6516e4366c0fa7cef6df0064'
BUILD=TOOLS/'brain-storm-demucs-wasm'
BUILD.mkdir(parents=True,exist_ok=True)
if hashlib.sha256(MODEL.read_bytes()).hexdigest()!=PIN: raise SystemExit('Native stem model checksum mismatch')
if not (EIGEN/'Eigen/Core').exists(): raise SystemExit('Set SAMPLIFY_EIGEN_SOURCE to the pinned Eigen source tree')
# The original WASM loader repeats an uninitialized header read at normal EOF.
loader=(DEMUCS/'src_wasm/model_load.hpp').read_text()
old='''        int32_t n_dims;
        int32_t length;

        vector_read(&n_dims, sizeof(int32_t), 1, f);
        vector_read(&length, sizeof(int32_t), 1, f);'''
new='''        int32_t n_dims = 0;
        int32_t length = 0;
        if (vector_read(&n_dims, sizeof(int32_t), 1, f) != 1) {
            if (vector_eof(f)) break;
            return false;
        }
        if (vector_read(&length, sizeof(int32_t), 1, f) != 1
            || n_dims < 1 || n_dims > 4 || length < 1 || length > 4096) return false;'''
if old not in loader: raise SystemExit('Pinned WASM loader changed; audit checked-header patch')
(BUILD/'model_load.hpp').write_text(loader.replace(old,new))
apply=(DEMUCS/'src/model_apply.cpp').read_text()
old='    // Normalize the audio\n'
new='''    if (!std::isfinite(ref_std) || ref_std < 1e-8f) {
        ref_std = std::sqrt((full_audio.array() - ref_mean).square().mean());
        ref_std = std::max(ref_std, 1e-8f);
    }
    // Normalize the audio
'''
if apply.count(old)!=2: raise SystemExit('Pinned normalization changed; audit stability patch')
(BUILD/'model_apply.cpp').write_text(apply.replace(old,new))
(BUILD/'bindings.cpp').write_text(r'''
#include <chrono>
#include <cmath>
#include <emscripten.h>
#include "model.hpp"
#include "model_load.hpp"
static demucscpp::demucs_model model;
EM_JS(void, reportStemProgress, (float progress), {
    if (self.__samplifyStemProgress) self.__samplifyStemProgress(progress);
});
extern "C" {
EMSCRIPTEN_KEEPALIVE int stem_model_init(const char* bytes, int length) {
    return load_demucs_model_for_wasm(bytes, length, &model) && model.is_4sources ? 1 : 0;
}
EMSCRIPTEN_KEEPALIVE int stem_demix(const float* left, const float* right, int length, float* output) {
    if (length < 2) return 0;
    Eigen::MatrixXf input(2, length);
    for (int i = 0; i < length; ++i) { input(0,i)=left[i]; input(1,i)=right[i]; }
    auto result=demucscpp::demucs_inference(model, input, [](float p, std::string) { reportStemProgress(p); });
    if (result.dimension(0)!=4 || result.dimension(1)!=2 || result.dimension(2)!=length) return 0;
    for (int stem=0; stem<4; ++stem) for (int channel=0; channel<2; ++channel)
        for (int i=0; i<length; ++i) {
            const float value=result(stem,channel,i);
            if (!std::isfinite(value)) return 0;
            output[(stem*2+channel)*length+i]=value;
        }
    return 1;
}
}
''')
sources=['crosstransformer.cpp','dsp.cpp','encdec.cpp','layers.cpp','lstm.cpp','model_inference.cpp']
cmake='''cmake_minimum_required(VERSION 3.20)
project(SamplifyBrowserStems LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)
add_executable(demucs bindings.cpp model_apply.cpp\n'''+''.join(' "'+str(DEMUCS/'src'/f)+'"\n' for f in sources)+''')
target_include_directories(demucs PRIVATE "'''+str(DEMUCS/'src')+'" "'+str(EIGEN)+'''" ".")
target_compile_definitions(demucs PRIVATE EIGEN_DONT_PARALLELIZE)
target_compile_options(demucs PRIVATE -O2 -msimd128 -msse4.2 -flto -fno-exceptions -fno-rtti)
target_link_options(demucs PRIVATE -O2 -msimd128 -flto
 "-sALLOW_MEMORY_GROWTH=1" "-sINITIAL_MEMORY=268435456" "-sMAXIMUM_MEMORY=4294967296"
 "-sSTACK_SIZE=5242880" "-sMODULARIZE=1" "-sEXPORT_ES6=1" "-sEXPORT_NAME=createDemucs"
 "-sENVIRONMENT=web,worker" "-sABORTING_MALLOC=1"
 "-sEXPORTED_FUNCTIONS=['_malloc','_free','_stem_model_init','_stem_demix']")
'''
(BUILD/'CMakeLists.txt').write_text(cmake)
cmake_bin=shutil.which('cmake') or str(TOOLS/'cmake/data/bin/cmake')
env=os.environ.copy(); env['CMAKE_BUILD_PARALLEL_LEVEL']='2'
subprocess.run(['emcmake',cmake_bin,'-S',str(BUILD),'-B',str(BUILD/'build'),'-DCMAKE_BUILD_TYPE=Release'],check=True,env=env)
subprocess.run([cmake_bin,'--build',str(BUILD/'build'),'--parallel','2'],check=True,env=env)
public=ROOT/'public'; (public/'stems').mkdir(exist_ok=True); (public/'models').mkdir(exist_ok=True)
for name in ('demucs.js','demucs.wasm'): shutil.copyfile(BUILD/'build'/name,public/'stems'/name)
parts=[]
with MODEL.open('rb') as stream:
    while data:=stream.read(16*1024*1024):
        name=f'htdemucs-4s-f16.part-{len(parts):02}.bin'
        (public/'models'/name).write_bytes(data)
        parts.append({'file':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
manifest={'version':1,'sampleRate':44100,'model':'HTDemucs 4-source (Meta)','sha256':PIN,'bytes':MODEL.stat().st_size,'parts':parts,'sourceCommit':'f1206e9adeea103aef4a636b9e62297cf1f8e34e','nativeOrder':['drums','bass','other','vocals']}
(public/'models/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
licenses=Path('/workspace/mellowdy-chop/src/stems/licenses')
for name in ('Demucs-MIT.txt','DemucsCpp-MIT.txt','Eigen-MPL-2.0.txt','NativeStems-Notice.txt'):
    shutil.copyfile(licenses/name,public/'stems'/name)
print('Built real HTDemucs WASM, six model chunks, pinned manifest and notices.')
