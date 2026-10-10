import * as THREE from 'three';
import { course, islands, islandHeight, terrainHeight, type Obstacle } from './flight';

const sand = new THREE.Color('#d4c69d'),
  grass = new THREE.Color('#72896a'),
  rock = new THREE.Color('#738681');
export function createWorld(scene: THREE.Scene) {
  const obstacles: Obstacle[] = [];
  const animated: { mesh: THREE.Object3D; kind: 'bird' | 'boat'; offset: number }[] = [];
  let seed = 427;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const water = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, eye: { value: new THREE.Vector3() } },
    vertexShader: `uniform float time; varying vec3 worldPosition;
      void main(){ vec3 p=position; p.z=sin(p.x*.065+time*.7)*.19+sin(p.y*.09-time*.5)*.14;
      vec4 world=modelMatrix*vec4(p,1.); worldPosition=world.xyz; gl_Position=projectionMatrix*viewMatrix*world; }`,
    fragmentShader: `uniform float time; uniform vec3 eye; varying vec3 worldPosition;
      void main(){vec2 p=worldPosition.xz; float shallow=0.;
      shallow=max(shallow,1.-smoothstep(80.,140.,distance(p,vec2(-40.,25.))));
      shallow=max(shallow,1.-smoothstep(75.,145.,distance(p,vec2(150.,-170.))));
      shallow=max(shallow,1.-smoothstep(90.,150.,distance(p,vec2(-150.,-240.))));
      shallow=max(shallow,1.-smoothstep(110.,170.,distance(p,vec2(25.,-450.))));
      vec3 col=mix(vec3(.075,.27,.31),vec3(.21,.56,.53),shallow);
      float a=sin(p.x*.22+p.y*.13+time*.9); float b=cos(p.y*.27-p.x*.08-time*.6);
      vec3 normal=normalize(vec3(a*.13,1.,b*.11));vec3 v=normalize(eye-worldPosition);
      float fresnel=pow(1.-max(dot(v,normal),0.),3.);
      col=mix(col,vec3(.58,.72,.71),fresnel*.48);
      float spec=pow(max(dot(normal,normalize(v+normalize(vec3(-.4,.34,-.8)))),0.),90.);
      col+=vec3(1.,.88,.6)*spec*.85;
      col+=pow(max(0.,sin(p.x*.65+sin(p.y*.3+time)*2.)*cos(p.y*.54-time*.35)),12.)*.018;
      float fog=1.-exp(-distance(eye,worldPosition)*.0009);col=mix(col,vec3(.57,.69,.68),fog);
      gl_FragColor=vec4(col,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment> }`,
  });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000, 120, 120), water);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.12;
  scene.add(ocean);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2300, 32, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `varying vec3 direction;void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec3 direction;void main(){vec3 d=normalize(direction);float h=clamp(d.y,0.,1.);vec3 c=mix(vec3(.69,.77,.71),vec3(.15,.37,.44),pow(h,.6));float glow=pow(max(dot(d,normalize(vec3(-.4,.34,-.8))),0.),12.);c+=vec3(.32,.2,.075)*glow;float sun=pow(max(dot(d,normalize(vec3(-.4,.34,-.8))),0.),1900.);c+=vec3(1.,.9,.55)*sun*1.5;gl_FragColor=vec4(c,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment> }`,
    }),
  );
  scene.add(sky);

  for (const island of islands) {
    const positions: number[] = [],
      colors: number[] = [],
      indices: number[] = [];
    const radial = 38,
      segments = 96;
    for (let r = 0; r <= radial; r++)
      for (let s = 0; s <= segments; s++) {
        const angle = (s / segments) * Math.PI * 2;
        const edge = 1 + Math.sin(angle * 5 + island.x) * 0.045 + Math.cos(angle * 3) * 0.04;
        const x = island.x + ((Math.cos(angle) * island.rx * r) / radial) * edge;
        const z = island.z + ((Math.sin(angle) * island.rz * r) / radial) * edge;
        const y = islandHeight(x, z, island);
        positions.push(x, y, z);
        const c = y < 2 ? sand.clone() : grass.clone().lerp(rock, Math.max(0, (y - 8) / 28));
        c.multiplyScalar(0.93 + random() * 0.12);
        colors.push(c.r, c.g, c.b);
        if (r < radial && s < segments) {
          const a = r * (segments + 1) + s,
            b = a + segments + 1;
          indices.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    );
    mesh.receiveShadow = true;
    scene.add(mesh);
    const foamPoints = Array.from({ length: 129 }, (_, i) => {
      const angle = (i / 128) * Math.PI * 2,
        edge = 1 + Math.sin(angle * 5 + island.x) * 0.045 + Math.cos(angle * 3) * 0.04;
      return new THREE.Vector3(
        island.x + Math.cos(angle) * island.rx * edge * 0.96,
        0.12,
        island.z + Math.sin(angle) * island.rz * edge * 0.96,
      );
    });
    scene.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(foamPoints),
        new THREE.LineBasicMaterial({ color: 0xe5edda, transparent: true, opacity: 0.32 }),
      ),
    );
  }
  const trunk = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.18, 0.3, 1, 5),
    new THREE.MeshStandardMaterial({ color: 0x716d55, roughness: 1 }),
    420,
  );
  const leaves = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshStandardMaterial({ color: 0x426c57, roughness: 1 }),
    420,
  );
  const dummy = new THREE.Object3D();
  let count = 0;
  for (let i = 0; i < 850 && count < 420; i++) {
    const island = islands[i % islands.length],
      x = island.x + (random() - 0.5) * island.rx * 1.5,
      z = island.z + (random() - 0.5) * island.rz * 1.5;
    const height = terrainHeight(x, z);
    if (
      height < 2.5 ||
      Math.hypot(x, z - 45) < 25 ||
      course.some((r) => Math.hypot(x - r.x, z - r.z) < 16)
    )
      continue;
    const size = 3 + random() * 3;
    dummy.position.set(x, height + size * 0.4, z);
    dummy.scale.set(1, size * 0.8, 1);
    dummy.rotation.set(0, random() * 6, 0);
    dummy.updateMatrix();
    trunk.setMatrixAt(count, dummy.matrix);
    dummy.position.y = height + size;
    dummy.scale.set(size * 0.52, size * 0.65, size * 0.52);
    dummy.updateMatrix();
    leaves.setMatrixAt(count, dummy.matrix);
    leaves.setColorAt(
      count,
      new THREE.Color().setHSL(0.34 + random() * 0.06, 0.23, 0.23 + random() * 0.14),
    );
    count++;
  }
  trunk.count = leaves.count = count;
  trunk.castShadow = leaves.castShadow = true;
  scene.add(trunk, leaves);
  const stone = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x7d8e87, roughness: 1 }),
    130,
  );
  for (let i = 0; i < 130; i++) {
    const island = islands[i % 4],
      angle = random() * Math.PI * 2;
    const x = island.x + Math.cos(angle) * island.rx * (0.7 + random() * 0.35),
      z = island.z + Math.sin(angle) * island.rz * (0.7 + random() * 0.35);
    dummy.position.set(x, terrainHeight(x, z), z);
    dummy.scale.set(1 + random() * 3, 1 + random() * 2, 1 + random() * 3);
    dummy.rotation.set(random(), random() * 6, random());
    dummy.updateMatrix();
    stone.setMatrixAt(i, dummy.matrix);
  }
  stone.castShadow = true;
  scene.add(stone);
  const cream = new THREE.MeshStandardMaterial({ color: 0xe1ddc4, roughness: 0.8 });
  const graphite = new THREE.MeshStandardMaterial({ color: 0x324e50, roughness: 0.75 });
  const orange = new THREE.MeshStandardMaterial({ color: 0xbe8060, roughness: 0.8 });
  const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xe4ffc5 });
  function building(
    x: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: THREE.Material,
  ) {
    const y = terrainHeight(x, z),
      mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    obstacles.push({
      min: { x: x - w / 2, y, z: z - d / 2 },
      max: { x: x + w / 2, y: y + h, z: z + d / 2 },
    });
    return mesh;
  }
  building(-22, 40, 16, 7, 15, graphite);
  const hangarRoof = new THREE.Mesh(
    new THREE.CylinderGeometry(8.1, 8.1, 15.4, 24, 1, false, 0, Math.PI),
    graphite,
  );
  hangarRoof.rotation.x = Math.PI / 2;
  hangarRoof.rotation.z = Math.PI / 2;
  hangarRoof.position.set(-22, terrainHeight(-22, 40) + 7, 40);
  scene.add(hangarRoof);
  for (let i = 0; i < 6; i++) building(-29 + i * 2.6, 31.9, 1.4, 3.3, 0.14, cream);
  const padY = terrainHeight(0, 45) + 0.07;
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 0.22, 64), graphite);
  pad.position.set(0, padY, 45);
  pad.receiveShadow = true;
  scene.add(pad);
  const padTexture = document.createElement('canvas');
  padTexture.width = padTexture.height = 256;
  const ctx = padTexture.getContext('2d')!;
  ctx.strokeStyle = '#d6f58c';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(128, 128, 107, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = 'bold 108px sans-serif';
  ctx.fillStyle = '#e4eed6';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('H', 128, 135);
  const padMark = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(padTexture),
      transparent: true,
      depthWrite: false,
    }),
  );
  padMark.rotation.x = -Math.PI / 2;
  padMark.position.set(0, padY + 0.13, 45);
  scene.add(padMark);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), lightMaterial);
    lamp.position.set(Math.sin(a) * 10.5, padY + 0.2, 45 + Math.cos(a) * 10.5);
    scene.add(lamp);
  }
  for (const [x, z] of [
    [122, -205],
    [-155, -210],
    [-126, -260],
    [55, -435],
  ]) {
    building(x, z, 6, 4, 8, cream);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.5, 3.2, 4), orange);
    roof.rotation.y = Math.PI / 4;
    roof.position.set(x, terrainHeight(x, z) + 5.6, z);
    roof.castShadow = true;
    scene.add(roof);
  }
  const lx = 126,
    lz = -259,
    ly = terrainHeight(lx, lz);
  const lighthouse = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.6, 22, 20), cream);
  lighthouse.position.set(lx, ly + 11, lz);
  lighthouse.castShadow = true;
  scene.add(lighthouse);
  obstacles.push({
    min: { x: lx - 3.6, y: ly, z: lz - 3.6 },
    max: { x: lx + 3.6, y: ly + 27, z: lz + 3.6 },
  });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 3, 16), graphite);
  top.position.set(lx, ly + 23.5, lz);
  scene.add(top);
  const light = new THREE.Mesh(new THREE.CylinderGeometry(2.65, 2.65, 1.1, 16), lightMaterial);
  light.position.set(lx, ly + 23.6, lz);
  scene.add(light);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(3.9, 2.8, 16), orange);
  cap.position.set(lx, ly + 26, lz);
  scene.add(cap);
  for (let i = 0; i < 6; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.65, 6), cream);
    hull.position.y = 0.25;
    boat.add(hull);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.2, 2), graphite);
    cabin.position.set(0, 1.1, 0.5);
    boat.add(cabin);
    boat.position.set(-90 + i * 64, 0, -65 - i * 41);
    boat.rotation.y = i;
    scene.add(boat);
    animated.push({ mesh: boat, kind: 'boat', offset: i * 2 });
  }
  for (let i = 0; i < 16; i++) {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.65, 0, 0),
      new THREE.Vector3(0, -0.16, 0.15),
      new THREE.Vector3(0.65, 0, 0),
    ]);
    const bird = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x2e4c4f }));
    scene.add(bird);
    animated.push({ mesh: bird, kind: 'bird', offset: i * 19 });
  }
  const rings = course.map((point, i) => {
    const group = new THREE.Group();
    group.position.set(point.x, point.y, point.z);
    const previous = i ? course[i - 1] : { x: 0, z: 45 };
    group.rotation.y = Math.atan2(point.x - previous.x, point.z - previous.z);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(8.5, 0.13, 8, 80),
      new THREE.MeshBasicMaterial({ color: 0xd6f58c, transparent: true, opacity: 0.95 }),
    );
    group.add(ring);
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(8.5, 0.42, 6, 80),
      new THREE.MeshBasicMaterial({
        color: 0xd6f58c,
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
      }),
    );
    group.add(halo);
    for (let j = 0; j < 4; j++) {
      const marker = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.5, 0.11), lightMaterial);
      const a = (j / 4) * Math.PI * 2;
      marker.position.set(Math.cos(a) * 8.5, Math.sin(a) * 8.5, 0);
      marker.rotation.z = a - Math.PI / 2;
      group.add(marker);
    }
    scene.add(group);
    return group;
  });
  const dust = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.18, 0.18),
    new THREE.MeshBasicMaterial({
      color: 0xe0e6c4,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    45,
  );
  scene.add(dust);
  return {
    obstacles,
    rings,
    update(
      time: number,
      camera: THREE.Camera,
      craftPosition: THREE.Vector3,
      activeRing: number,
      showRings: boolean,
    ) {
      water.uniforms.time.value = time;
      water.uniforms.eye.value.copy(camera.position);
      sky.position.copy(camera.position);
      rings.forEach((ring, i) => {
        ring.visible = showRings && i >= activeRing;
        const material = (
          ring.children[0] as THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>
        ).material;
        material.opacity = i === activeRing ? 0.9 + Math.sin(time * 3) * 0.1 : 0.22;
        ring.scale.setScalar(i === activeRing ? 1 + Math.sin(time * 2) * 0.008 : 1);
      });
      for (const item of animated) {
        if (item.kind === 'boat') {
          item.mesh.position.y = Math.sin(time * 0.8 + item.offset) * 0.15;
          item.mesh.rotation.z = Math.sin(time * 0.65 + item.offset) * 0.04;
        } else {
          const a = time * 0.07 + item.offset;
          item.mesh.position.set(
            Math.cos(a) * (70 + item.offset * 0.3),
            28 + Math.sin(a * 2) * 4,
            -190 + Math.sin(a) * 100,
          );
          item.mesh.rotation.y = -a;
          item.mesh.rotation.z = Math.sin(time * 3 + item.offset) * 0.17;
        }
      }
      const ground = terrainHeight(craftPosition.x, craftPosition.z),
        intensity = Math.max(0, 1 - (craftPosition.y - ground) / 16);
      dust.visible = intensity > 0.01;
      if (dust.visible)
        for (let i = 0; i < 45; i++) {
          const life = (time * 0.6 + i / 45) % 1,
            angle = i * 2.399 + time * 0.2;
          const radius = 1.4 + life * 10;
          dummy.position.set(
            craftPosition.x + Math.cos(angle) * radius,
            ground + 0.2 + life * 1.7,
            craftPosition.z + Math.sin(angle) * radius,
          );
          dummy.scale.setScalar((1 - life) * intensity * (ground < 0.1 ? 2 : 1));
          dummy.quaternion.copy(camera.quaternion);
          dummy.updateMatrix();
          dust.setMatrixAt(i, dummy.matrix);
        }
      dust.instanceMatrix.needsUpdate = true;
    },
  };
}
